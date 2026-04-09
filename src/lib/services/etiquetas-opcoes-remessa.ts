import { supabase } from '@/lib/supabase';

export type OpcaoRemessaSepEtiquetas = { lote: string; created_at: string };

export type BuscarOpcoesRemessaSepOpts = {
  /** Quando definido (ex.: indústria do operador), limita às remessas com esta origem — alinhado a Separar por Loja. */
  origemId?: string | null;
};

/** Transferências matriz→loja recentes (mesma base que Separar por Loja). */
const LIM_TRANSFERENCIAS_VIAGEM = 200;
/**
 * Fallback se a RPC `etiquetas_lotes_sep_recentes` não existir (migração não aplicada).
 * Bem menor que o antigo 10k — cada lote tem N linhas; 10k linhas ≠ 10k remessas e travava o app.
 */
const SCAN_ETIQUETAS_LOTES_FALLBACK = 2000;
/** Teto total de opções no select (evita listas enormes no DOM). */
const MAX_OPCOES_REMESSA_TOTAL = 200;

/** Limites expostos para texto de ajuda na tela Etiquetas. */
export const ETIQUETAS_UI_LIMITES_REMESA = {
  maxOpcoesNoSelect: MAX_OPCOES_REMESSA_TOTAL,
  limTransferenciasViagem: LIM_TRANSFERENCIAS_VIAGEM,
  scanEtiquetasFallback: SCAN_ETIQUETAS_LOTES_FALLBACK,
} as const;

function ordenarPorCreatedAtDesc(opcoes: OpcaoRemessaSepEtiquetas[]): OpcaoRemessaSepEtiquetas[] {
  return [...opcoes].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/**
 * Lista lotes `SEP-{viagem_id}` para o select da tela Etiquetas.
 * Prioriza remessas em `transferencias` (igual painel «Envios já registrados»; não exige linha em `etiquetas`).
 * Completa com scan em `etiquetas` (`excluida = false`) para lotes órfãos ou antigos.
 */
export async function buscarOpcoesRemessaSepParaEtiquetas(
  opts?: BuscarOpcoesRemessaSepOpts
): Promise<OpcaoRemessaSepEtiquetas[]> {
  const origem = opts?.origemId?.trim() || null;

  let q = supabase
    .from('transferencias')
    .select('viagem_id, created_at')
    .eq('tipo', 'WAREHOUSE_STORE')
    .not('viagem_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(LIM_TRANSFERENCIAS_VIAGEM);

  if (origem) q = q.eq('origem_id', origem);

  const { data: trans, error: eTrans } = await q;

  if (eTrans) throw eTrans;

  const porLote = new Map<string, string>();
  for (const t of trans || []) {
    const vid = t.viagem_id as string | null;
    if (!vid) continue;
    const lote = `SEP-${vid}`;
    const ca = String(t.created_at ?? '');
    const prev = porLote.get(lote);
    if (!prev || ca > prev) porLote.set(lote, ca);
  }

  const opcoes: OpcaoRemessaSepEtiquetas[] = [...porLote.entries()].map(([lote, created_at]) => ({
    lote,
    created_at,
  }));

  let ordenadas = ordenarPorCreatedAtDesc(opcoes);
  const seen = new Set(ordenadas.map((o) => o.lote));

  if (ordenadas.length < MAX_OPCOES_REMESSA_TOTAL) {
    const { data: rpcRows, error: rpcErr } = await supabase.rpc('etiquetas_lotes_sep_recentes', {
      p_limit: MAX_OPCOES_REMESSA_TOTAL,
    });

    if (!rpcErr && Array.isArray(rpcRows) && rpcRows.length > 0) {
      for (const row of rpcRows as { lote?: string; created_at?: string }[]) {
        if (ordenadas.length >= MAX_OPCOES_REMESSA_TOTAL) break;
        const l = row.lote != null ? String(row.lote).trim() : '';
        if (!l || seen.has(l)) continue;
        seen.add(l);
        ordenadas.push({ lote: l, created_at: String(row.created_at ?? '') });
      }
    } else {
      const { data: slim, error: eSlim } = await supabase
        .from('etiquetas')
        .select('lote, created_at')
        .eq('excluida', false)
        .like('lote', 'SEP-%')
        .order('created_at', { ascending: false })
        .limit(SCAN_ETIQUETAS_LOTES_FALLBACK);

      if (eSlim) throw eSlim;

      for (const row of slim || []) {
        if (ordenadas.length >= MAX_OPCOES_REMESSA_TOTAL) break;
        const l = row.lote as string | null;
        if (!l || seen.has(l)) continue;
        seen.add(l);
        ordenadas.push({ lote: l, created_at: String(row.created_at) });
      }
    }
  }

  ordenadas = ordenarPorCreatedAtDesc(ordenadas);
  if (ordenadas.length > MAX_OPCOES_REMESSA_TOTAL) {
    ordenadas = ordenadas.slice(0, MAX_OPCOES_REMESSA_TOTAL);
  }
  return ordenadas;
}
