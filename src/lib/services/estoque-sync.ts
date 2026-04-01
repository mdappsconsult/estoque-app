import { supabase } from '@/lib/supabase';

export async function recalcularEstoqueProduto(produtoId: string): Promise<void> {
  if (!produtoId) return;

  const { count, error: countError } = await supabase
    .from('itens')
    .select('id', { count: 'exact', head: true })
    .eq('produto_id', produtoId)
    .eq('estado', 'EM_ESTOQUE');
  if (countError) throw countError;

  const { error: upsertError } = await supabase
    .from('estoque')
    .upsert(
      {
        produto_id: produtoId,
        quantidade: count ?? 0,
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
