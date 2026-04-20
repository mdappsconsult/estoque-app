import { supabase } from '@/lib/supabase';

/** Exclui datas sentinela de «sem validade» (ex.: 2999) da lista operacional. */
export const DATA_VALIDADE_LIMITE_SENTINELA = '2100-01-01T00:00:00.000Z';

export type ItemValidadeRow = {
  id: string;
  token_qr: string;
  token_short?: string | null;
  estado: string;
  local_atual_id: string | null;
  data_validade: string;
  data_producao?: string | null;
  created_at: string;
  produto: { nome: string } | null;
  local_atual: { nome: string } | null;
  lote_compra?: {
    lote_fornecedor: string;
    created_at: string;
    nota_fiscal: string | null;
  } | null;
  /** Linha em `etiquetas` (remessa SEP etc.), quando existir. */
  etiqueta?: { lote: string | null; created_at: string } | null;
  /**
   * Melhor estimativa de «primeira confirmação neste local»: auditoria de recebimento
   * ou entrada de faltante na divergência (ISO).
   */
  confirmacao_neste_local_em?: string | null;
  /** Se não houver auditoria de recebimento: criação da remessa que levou o item (proxy). */
  remessa_vinculada_criada_em?: string | null;
};

const SELECT_VALIDADES = [
  'id',
  'token_qr',
  'token_short',
  'estado',
  'local_atual_id',
  'data_validade',
  'data_producao',
  'created_at',
  'lote_compra_id',
  'produto:produtos(nome)',
  'local_atual:locais!local_atual_id(nome)',
  'lote_compra:lotes_compra(lote_fornecedor, created_at, nota_fiscal)',
].join(',');

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function minIso(isos: string[]): string | null {
  if (isos.length === 0) return null;
  return isos.reduce((a, b) => (a < b ? a : b));
}

/**
 * Enriquece com etiquetas (lote SEP) e datas de confirmação no local atual (auditoria).
 */
async function enriquecerAuditoria(rows: ItemValidadeRow[]): Promise<void> {
  const ids = [...new Set(rows.map((r) => r.id))];
  if (ids.length === 0) return;

  const etiquetasMap = new Map<string, { lote: string | null; created_at: string }>();
  for (const part of chunk(ids, 200)) {
    const { data, error } = await supabase
      .from('etiquetas')
      .select('id, lote, created_at')
      .in('id', part);
    if (error) {
      console.error('validades-itens: etiquetas', error.message);
      continue;
    }
    for (const e of data || []) {
      etiquetasMap.set(String((e as { id: string }).id), {
        lote: (e as { lote: string | null }).lote,
        created_at: String((e as { created_at: string }).created_at),
      });
    }
  }

  const locals = [...new Set(rows.map((r) => r.local_atual_id).filter(Boolean))] as string[];

  const tiAll: { item_id: string; transferencia_id: string }[] = [];
  for (const part of chunk(ids, 200)) {
    const { data, error } = await supabase
      .from('transferencia_itens')
      .select('item_id, transferencia_id')
      .in('item_id', part);
    if (error) {
      console.error('validades-itens: transferencia_itens', error.message);
      continue;
    }
    tiAll.push(...((data || []) as { item_id: string; transferencia_id: string }[]));
  }

  const transIds = [...new Set(tiAll.map((t) => t.transferencia_id))];
  const transfers: { id: string; destino_id: string; status: string; created_at: string }[] = [];
  if (transIds.length > 0) {
    for (const part of chunk(transIds, 120)) {
      const { data, error } = await supabase
        .from('transferencias')
        .select('id, destino_id, status, created_at')
        .in('id', part)
        .in('status', ['DELIVERED', 'DIVERGENCE']);
      if (error) {
        console.error('validades-itens: transferencias', error.message);
        continue;
      }
      transfers.push(
        ...((data || []) as { id: string; destino_id: string; status: string; created_at: string }[])
      );
    }
  }
  const tById = new Map(transfers.map((t) => [t.id, t]));

  let auditsReceber: { created_at: string; local_id: string | null; detalhes: unknown }[] = [];
  if (locals.length > 0 && transIds.length > 0) {
    const { data, error } = await supabase
      .from('auditoria')
      .select('created_at, local_id, detalhes')
      .eq('acao', 'RECEBER_TRANSFERENCIA')
      .in('local_id', locals)
      .limit(8000);
    if (error) {
      console.error('validades-itens: auditoria receber', error.message);
    } else {
      auditsReceber = (data || []) as typeof auditsReceber;
      const tidAud = new Set(tiAll.map((t) => t.transferencia_id));
      auditsReceber = auditsReceber.filter((a) => {
        const tid = (a.detalhes as { transferencia_id?: string } | null)?.transferencia_id;
        return Boolean(tid && tidAud.has(tid));
      });
    }
  }

  let auditsFaltante: { created_at: string; local_id: string | null; item_id: string | null }[] =
    [];
  {
    const { data, error } = await supabase
      .from('auditoria')
      .select('created_at, local_id, item_id')
      .eq('acao', 'ENTRADA_FALTANTE_DIVERGENCIA_LOJA')
      .in('item_id', ids)
      .limit(3000);
    if (error) {
      console.error('validades-itens: auditoria faltante', error.message);
    } else {
      auditsFaltante = (data || []) as typeof auditsFaltante;
    }
  }

  for (const row of rows) {
    const et = etiquetasMap.get(row.id);
    if (et) row.etiqueta = et;

    const lid = row.local_atual_id;
    if (!lid) continue;

    const cand: string[] = [];
    const transCriada: string[] = [];

    const tidsForItem = new Set(tiAll.filter((t) => t.item_id === row.id).map((t) => t.transferencia_id));
    for (const tid of tidsForItem) {
      const tr = tById.get(tid);
      if (!tr || tr.destino_id !== lid) continue;
      transCriada.push(tr.created_at);

      for (const a of auditsReceber) {
        if (a.local_id !== lid) continue;
        const dtid = (a.detalhes as { transferencia_id?: string } | null)?.transferencia_id;
        if (dtid === tid) {
          cand.push(a.created_at);
        }
      }
    }

    for (const a of auditsFaltante) {
      if (a.item_id === row.id && a.local_id === lid) {
        cand.push(a.created_at);
      }
    }

    const conf = minIso(cand);
    if (conf) {
      row.confirmacao_neste_local_em = conf;
    }
    const remessaCriada = minIso(transCriada);
    if (remessaCriada && !conf) {
      row.remessa_vinculada_criada_em = remessaCriada;
    }
  }
}

/**
 * Itens em estoque com validade «real» vencida ou nos próximos N dias.
 * `localAtualId` omitido = todas as unidades (gerência).
 */
export async function listarItensAlertaValidade(input: {
  localAtualId?: string | null;
  diasProximos: number;
  limiteVencidos?: number;
  limiteProximos?: number;
}): Promise<{ proximos: ItemValidadeRow[]; vencidos: ItemValidadeRow[]; error: string | null }> {
  const agoraIso = new Date().toISOString();
  const limite = new Date();
  limite.setDate(limite.getDate() + input.diasProximos);
  const limiteIso = limite.toISOString();

  const base = () => {
    let q = supabase
      .from('itens')
      .select(SELECT_VALIDADES)
      .eq('estado', 'EM_ESTOQUE')
      .not('data_validade', 'is', null)
      .lt('data_validade', DATA_VALIDADE_LIMITE_SENTINELA);
    if (input.localAtualId) {
      q = q.eq('local_atual_id', input.localAtualId);
    }
    return q;
  };

  const limiteV = input.limiteVencidos ?? 500;
  const limiteP = input.limiteProximos ?? 2000;

  const [resVenc, resProx] = await Promise.all([
    base().lt('data_validade', agoraIso).order('data_validade', { ascending: true }).limit(limiteV),
    base()
      .gte('data_validade', agoraIso)
      .lte('data_validade', limiteIso)
      .order('data_validade', { ascending: true })
      .limit(limiteP),
  ]);

  if (resVenc.error) {
    return { proximos: [], vencidos: [], error: resVenc.error.message };
  }
  if (resProx.error) {
    return { proximos: [], vencidos: [], error: resProx.error.message };
  }

  const vencidos = (resVenc.data || []) as unknown as ItemValidadeRow[];
  const proximos = (resProx.data || []) as unknown as ItemValidadeRow[];

  const todos = [...vencidos, ...proximos];
  await enriquecerAuditoria(todos);

  return {
    vencidos,
    proximos,
    error: null,
  };
}
