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

function nomeProdutoDoItem(item: unknown): string {
  if (!item || typeof item !== 'object') return 'Produto';
  const it = item as { produto?: unknown };
  const p = it.produto;
  if (!p || typeof p !== 'object') return 'Produto';
  const o = Array.isArray(p) ? p[0] : p;
  if (!o || typeof o !== 'object') return 'Produto';
  const n = (o as { nome?: string }).nome;
  return (n && String(n).trim()) || 'Produto';
}

/**
 * Separações registradas (transferências matriz → loja): o que já foi enviado para as filiais.
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

  const ids = trans.map((t) => t.id);

  const { data: linhas, error: e2 } = await supabase
    .from('transferencia_itens')
    .select(
      `
      transferencia_id,
      item:itens!transferencia_itens_item_id_fkey(
        produto_id,
        produto:produtos(nome)
      )
    `
    )
    .in('transferencia_id', ids);
  if (e2) throw e2;

  const porTransf = new Map<string, Map<string, { nome: string; qtd: number }>>();

  for (const row of linhas || []) {
    const tid = row.transferencia_id as string;
    let agg = porTransf.get(tid);
    if (!agg) {
      agg = new Map();
      porTransf.set(tid, agg);
    }
    const it = row.item as { produto_id?: string } | null;
    const pid = it?.produto_id;
    if (!pid) continue;
    const pnom = nomeProdutoDoItem(row.item);
    const cur = agg.get(pid);
    if (cur) cur.qtd += 1;
    else agg.set(pid, { nome: pnom, qtd: 1 });
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
    const m = porTransf.get(t.id as string) || new Map();
    const qtd = [...m.values()].reduce((s, x) => s + x.qtd, 0);
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
