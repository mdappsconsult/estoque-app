import { supabase } from '@/lib/supabase';

/**
 * Agregado global por produto: itens EM_ESTOQUE + saldo de compra ainda não emitido como QR
 * (quantidade do lote − itens já vinculados ao lote).
 */
export async function recalcularEstoqueProduto(produtoId: string): Promise<void> {
  if (!produtoId) return;

  const { count: itemCount, error: countError } = await supabase
    .from('itens')
    .select('id', { count: 'exact', head: true })
    .eq('produto_id', produtoId)
    .eq('estado', 'EM_ESTOQUE');
  if (countError) throw countError;

  const { data: lotes, error: lotesError } = await supabase
    .from('lotes_compra')
    .select('id, quantidade')
    .eq('produto_id', produtoId);
  if (lotesError) throw lotesError;

  const loteIds = (lotes || []).map((l) => l.id);
  const mintByLote = new Map<string, number>();
  if (loteIds.length > 0) {
    const { data: mintRows, error: mintErr } = await supabase
      .from('itens')
      .select('lote_compra_id')
      .in('lote_compra_id', loteIds);
    if (mintErr) throw mintErr;
    for (const row of mintRows || []) {
      if (row.lote_compra_id) {
        mintByLote.set(row.lote_compra_id, (mintByLote.get(row.lote_compra_id) || 0) + 1);
      }
    }
  }

  let bulkTotal = 0;
  for (const l of lotes || []) {
    const minted = mintByLote.get(l.id) || 0;
    bulkTotal += Math.max(0, l.quantidade - minted);
  }

  const quantidade = (itemCount ?? 0) + bulkTotal;

  const { error: upsertError } = await supabase
    .from('estoque')
    .upsert(
      {
        produto_id: produtoId,
        quantidade,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'produto_id' }
    );
  if (upsertError) throw upsertError;
}

export async function recalcularEstoqueProdutos(produtoIds: string[]): Promise<void> {
  const idsUnicos = Array.from(new Set(produtoIds.filter(Boolean)));
  for (const produtoId of idsUnicos) {
    await recalcularEstoqueProduto(produtoId);
  }
}
