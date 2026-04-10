import { supabase } from '@/lib/supabase';

export type EnvioMatrizLojaResumo = {
  transferencia_id: string;
  origem_id: string;
  destino_id: string;
  created_at: string;
  status: string;
  viagem_id: string | null;
  origem_nome: string;
  destino_nome: string;
  qtd_unidades: number;
  /** Resumo legível: produto × quantidade. */
  resumo_produtos: string;
  lote_sep: string | null;
};

function nomeJoin(v: unknown): string {
  if (!v || typeof v !== 'object') return '—';
  const n = (v as { nome?: string }).nome;
  return (n && String(n).trim()) || '—';
}

const CHUNK_TRANSF_IDS = 24;
const CHUNK_ITEM_IDS = 250;

/**
 * Separações registradas (transferências matriz → loja): o que já foi enviado para as filiais.
 * Evita embed profundo `transferencia_itens → itens → produtos` (PostgREST fica pesado com muitas linhas).
 */
export async function buscarEnviosRecentesMatrizParaLojas(opts: {
  origemId?: string;
  destinoId?: string;
  limiteTransferencias?: number;
}): Promise<EnvioMatrizLojaResumo[]> {
  const lim = Math.min(Math.max(opts.limiteTransferencias ?? 25, 1), 60);

  let q = supabase
    .from('transferencias')
    .select(
      `
      id,
      origem_id,
      destino_id,
      created_at,
      status,
      viagem_id,
      origem:locais!origem_id(nome),
      destino:locais!destino_id(nome)
    `
    )
    .eq('tipo', 'WAREHOUSE_STORE')
    .order('created_at', { ascending: false })
    .limit(lim);

  if (opts.origemId) q = q.eq('origem_id', opts.origemId);
  if (opts.destinoId) q = q.eq('destino_id', opts.destinoId);

  const { data: trans, error } = await q;
  if (error) throw error;
  if (!trans?.length) return [];

  const transIds = trans.map((t) => t.id as string);
  const linhas: { transferencia_id: string; item_id: string }[] = [];

  for (let i = 0; i < transIds.length; i += CHUNK_TRANSF_IDS) {
    const slice = transIds.slice(i, i + CHUNK_TRANSF_IDS);
    const { data: chunk, error: e2 } = await supabase
      .from('transferencia_itens')
      .select('transferencia_id, item_id')
      .in('transferencia_id', slice);
    if (e2) throw e2;
    for (const row of chunk || []) {
      const tid = row.transferencia_id as string;
      const itemId = String((row as { item_id?: string }).item_id || '').trim();
      if (tid && itemId) linhas.push({ transferencia_id: tid, item_id: itemId });
    }
  }

  const itemIds = [...new Set(linhas.map((l) => l.item_id))];
  const produtoPorItem = new Map<string, string>();
  for (let i = 0; i < itemIds.length; i += CHUNK_ITEM_IDS) {
    const slice = itemIds.slice(i, i + CHUNK_ITEM_IDS);
    const { data: itRows, error: e3 } = await supabase
      .from('itens')
      .select('id, produto_id')
      .in('id', slice);
    if (e3) throw e3;
    for (const r of itRows || []) {
      const pid = String((r as { produto_id?: string }).produto_id || '').trim();
      if (pid) produtoPorItem.set(r.id as string, pid);
    }
  }

  const produtoIds = [...new Set([...produtoPorItem.values()])];
  const nomePorProduto = new Map<string, string>();
  for (let i = 0; i < produtoIds.length; i += CHUNK_ITEM_IDS) {
    const slice = produtoIds.slice(i, i + CHUNK_ITEM_IDS);
    const { data: prows, error: e4 } = await supabase.from('produtos').select('id, nome').in('id', slice);
    if (e4) throw e4;
    for (const r of prows || []) {
      nomePorProduto.set(
        r.id as string,
        String((r as { nome?: string }).nome || 'Produto').trim() || 'Produto'
      );
    }
  }

  /** Por transferência: agregação por produto só com `item_id` distintos. */
  const porTransf = new Map<string, { agg: Map<string, { nome: string; qtd: number }>; vistos: Set<string> }>();

  for (const row of linhas) {
    const tid = row.transferencia_id;
    const itemId = row.item_id;
    let bucket = porTransf.get(tid);
    if (!bucket) {
      bucket = { agg: new Map(), vistos: new Set() };
      porTransf.set(tid, bucket);
    }
    if (bucket.vistos.has(itemId)) continue;
    bucket.vistos.add(itemId);
    const pid = produtoPorItem.get(itemId);
    if (!pid) continue;
    const pnom = nomePorProduto.get(pid) ?? 'Produto';
    const cur = bucket.agg.get(pid);
    if (cur) cur.qtd += 1;
    else bucket.agg.set(pid, { nome: pnom, qtd: 1 });
  }

  function resumoTexto(m: Map<string, { nome: string; qtd: number }>): string {
    const parts = [...m.values()]
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      .map((x) => `${x.nome} ×${x.qtd}`);
    if (parts.length === 0) return '—';
    if (parts.length <= 5) return parts.join(' · ');
    return `${parts.slice(0, 5).join(' · ')} · +${parts.length - 5} prod.`;
  }

  return trans.map((t) => {
    const bucket = porTransf.get(t.id as string);
    const m = bucket?.agg || new Map();
    const qtd = bucket ? bucket.vistos.size : [...m.values()].reduce((s, x) => s + x.qtd, 0);
    const vid = (t.viagem_id as string | null) ?? null;
    return {
      transferencia_id: t.id as string,
      origem_id: t.origem_id as string,
      destino_id: t.destino_id as string,
      created_at: t.created_at as string,
      status: t.status as string,
      viagem_id: vid,
      origem_nome: nomeJoin(t.origem),
      destino_nome: nomeJoin(t.destino),
      qtd_unidades: qtd,
      resumo_produtos: resumoTexto(m),
      lote_sep: vid ? `SEP-${vid}` : null,
    };
  });
}
