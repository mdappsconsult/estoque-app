import { supabase } from '@/lib/supabase';
import { Contagem, ContagemItem } from '@/types/database';

export interface ContagemCompleta extends Contagem {
  itens: (ContagemItem & { produto: { nome: string } })[];
}

// Buscar todas as contagens
export async function getContagens(): Promise<ContagemCompleta[]> {
  const { data: contagens, error } = await supabase
    .from('contagens')
    .select('*')
    .order('data', { ascending: false });

  if (error) throw error;

  // Buscar itens de cada contagem
  const contagensCompletas = await Promise.all(
    (contagens || []).map(async (contagem) => {
      const { data: itens } = await supabase
        .from('contagem_itens')
        .select('*, produto:produtos(nome)')
        .eq('contagem_id', contagem.id);

      return {
        ...contagem,
        itens: itens || [],
      };
    })
  );

  return contagensCompletas;
}

// Criar nova contagem
export async function createContagem(
  responsavel: string,
  itens: { produto_id: string; quantidade_sistema: number; quantidade_contada: number }[]
): Promise<Contagem> {
  // Criar contagem
  const { data: contagem, error } = await supabase
    .from('contagens')
    .insert({
      responsavel,
      status: 'finalizada',
    })
    .select()
    .single();

  if (error) throw error;

  // Inserir itens
  const itensData = itens.map((item) => ({
    contagem_id: contagem.id,
    produto_id: item.produto_id,
    quantidade_sistema: item.quantidade_sistema,
    quantidade_contada: item.quantidade_contada,
  }));

  await supabase
    .from('contagem_itens')
    .insert(itensData);

  // Atualizar estoque com as quantidades contadas
  for (const item of itens) {
    await supabase
      .from('estoque')
      .upsert({
        produto_id: item.produto_id,
        quantidade: item.quantidade_contada,
        updated_at: new Date().toISOString(),
      });
  }

  return contagem;
}

// Buscar contagem por ID
export async function getContagemById(id: string): Promise<ContagemCompleta | null> {
  const { data: contagem, error } = await supabase
    .from('contagens')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  if (!contagem) return null;

  const { data: itens } = await supabase
    .from('contagem_itens')
    .select('*, produto:produtos(nome)')
    .eq('contagem_id', contagem.id);

  return {
    ...contagem,
    itens: itens || [],
  };
}
