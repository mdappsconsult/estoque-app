import { supabase } from '@/lib/supabase';

export type DetalheLoteMassa = { lote_compra_id: string; gramas: number };

/**
 * Consome gramas dos lotes de compra do produto no local (FIFO por `created_at` do lote).
 * Atualiza `lotes_compra.gramas_consumidas_acumulado`.
 */
export async function consumirMassaProducaoFifo(input: {
  produtoId: string;
  localId: string;
  gramas: number;
}): Promise<{ detalhes: DetalheLoteMassa[] }> {
  const { produtoId, localId, gramas } = input;
  if (!Number.isFinite(gramas) || gramas <= 0) {
    return { detalhes: [] };
  }
  const gInt = Math.floor(gramas);
  if (gInt <= 0) return { detalhes: [] };

  const { data: produto, error: pe } = await supabase
    .from('produtos')
    .select('id, producao_consumo_por_massa, producao_gramas_por_embalagem')
    .eq('id', produtoId)
    .single();
  if (pe) throw pe;
  if (!produto?.producao_consumo_por_massa) {
    throw new Error('Este produto não está configurado para consumo por massa na produção.');
  }
  const G = Math.floor(Number(produto.producao_gramas_por_embalagem) || 0);
  if (G <= 0) {
    throw new Error('Configure «gramas por embalagem de compra» no cadastro do produto.');
  }

  const { data: lotes, error: le } = await supabase
    .from('lotes_compra')
    .select('id, quantidade, gramas_consumidas_acumulado, local_id')
    .eq('produto_id', produtoId)
    .eq('local_id', localId)
    .order('created_at', { ascending: true });
  if (le) throw le;

  const loteIds = (lotes || []).map((l) => l.id);
  const mintCountByLote = new Map<string, number>();
  if (loteIds.length > 0) {
    const { data: mintRows, error: mintErr } = await supabase
      .from('itens')
      .select('lote_compra_id')
      .in('lote_compra_id', loteIds);
    if (mintErr) throw mintErr;
    for (const row of mintRows || []) {
      if (row.lote_compra_id) {
        mintCountByLote.set(row.lote_compra_id, (mintCountByLote.get(row.lote_compra_id) || 0) + 1);
      }
    }
  }

  let need = gInt;
  const updates: { loteId: string; novoAcum: number; take: number }[] = [];

  for (const lote of lotes || []) {
    if (need <= 0) break;
    const minted = mintCountByLote.get(lote.id) || 0;
    const pacotesLivres = Math.max(0, lote.quantidade - minted);
    const maxGramasLote = pacotesLivres * G;
    const already = Math.max(0, Math.floor(Number(lote.gramas_consumidas_acumulado) || 0));
    const cap = Math.max(0, maxGramasLote - already);
    if (cap <= 0) continue;
    const take = Math.min(need, cap);
    updates.push({ loteId: lote.id, novoAcum: already + take, take });
    need -= take;
  }

  if (need > 0) {
    throw new Error(
      'Saldo em massa insuficiente para este insumo no local (verifique compras e gramas já consumidas).'
    );
  }

  const detalhes: DetalheLoteMassa[] = [];
  for (const u of updates) {
    const { error: ue } = await supabase
      .from('lotes_compra')
      .update({ gramas_consumidas_acumulado: u.novoAcum })
      .eq('id', u.loteId);
    if (ue) throw ue;
    detalhes.push({ lote_compra_id: u.loteId, gramas: u.take });
  }

  return { detalhes };
}

/** Gramas ainda disponíveis no local (soma dos lotes, FIFO implícito no consumo). */
export async function obterGramasDisponiveisMassa(
  produtoId: string,
  localId: string
): Promise<{ gramas: number; gramasPorEmbalagem: number }> {
  const { data: produto, error: pe } = await supabase
    .from('produtos')
    .select('producao_consumo_por_massa, producao_gramas_por_embalagem')
    .eq('id', produtoId)
    .single();
  if (pe) throw pe;
  const G = Math.floor(Number(produto?.producao_gramas_por_embalagem) || 0);
  if (!produto?.producao_consumo_por_massa || G <= 0) {
    return { gramas: 0, gramasPorEmbalagem: 0 };
  }

  const { data: lotes, error: le } = await supabase
    .from('lotes_compra')
    .select('id, quantidade, gramas_consumidas_acumulado')
    .eq('produto_id', produtoId)
    .eq('local_id', localId)
    .order('created_at', { ascending: true });
  if (le) throw le;

  const loteIds = (lotes || []).map((l) => l.id);
  const mintCountByLote = new Map<string, number>();
  if (loteIds.length > 0) {
    const { data: mintRows, error: mintErr } = await supabase
      .from('itens')
      .select('lote_compra_id')
      .in('lote_compra_id', loteIds);
    if (mintErr) throw mintErr;
    for (const row of mintRows || []) {
      if (row.lote_compra_id) {
        mintCountByLote.set(row.lote_compra_id, (mintCountByLote.get(row.lote_compra_id) || 0) + 1);
      }
    }
  }

  let total = 0;
  for (const lote of lotes || []) {
    const minted = mintCountByLote.get(lote.id) || 0;
    const pacotesLivres = Math.max(0, lote.quantidade - minted);
    const maxGramasLote = pacotesLivres * G;
    const already = Math.max(0, Math.floor(Number(lote.gramas_consumidas_acumulado) || 0));
    total += Math.max(0, maxGramasLote - already);
  }

  return { gramas: total, gramasPorEmbalagem: G };
}
