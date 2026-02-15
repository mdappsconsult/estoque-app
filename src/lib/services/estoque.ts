import { supabase } from '@/lib/supabase';
import { Recebimento, RecebimentoInsert, Producao, ProducaoInsert, Movimentacao } from '@/types/database';

// =====================================================
// RECEBIMENTOS (Entrada de produtos)
// =====================================================

export async function getRecebimentos(): Promise<(Recebimento & { produto: { nome: string } })[]> {
  const { data, error } = await supabase
    .from('recebimentos')
    .select('*, produto:produtos(nome)')
    .order('data_recebimento', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createRecebimento(recebimento: RecebimentoInsert): Promise<Recebimento> {
  const { data, error } = await supabase
    .from('recebimentos')
    .insert(recebimento)
    .select()
    .single();

  if (error) throw error;

  // Atualizar estoque (adicionar quantidade)
  await atualizarEstoque(recebimento.produto_id, recebimento.quantidade, 'entrada');

  // Registrar movimentação
  await registrarMovimentacao({
    produto_id: recebimento.produto_id,
    tipo: 'entrada',
    quantidade: recebimento.quantidade,
    motivo: 'Recebimento de produto',
    referencia_id: data.id,
    referencia_tipo: 'recebimento',
  });

  return data;
}

// =====================================================
// PRODUÇÕES
// =====================================================

export async function getProducoes(): Promise<(Producao & { produto: { nome: string } })[]> {
  const { data, error } = await supabase
    .from('producoes')
    .select('*, produto:produtos(nome)')
    .order('data_producao', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createProducao(producao: ProducaoInsert): Promise<Producao> {
  const { data, error } = await supabase
    .from('producoes')
    .insert(producao)
    .select()
    .single();

  if (error) throw error;

  // Atualizar estoque (adicionar quantidade produzida)
  await atualizarEstoque(producao.produto_id, producao.quantidade, 'entrada');

  // Registrar movimentação
  await registrarMovimentacao({
    produto_id: producao.produto_id,
    tipo: 'entrada',
    quantidade: producao.quantidade,
    motivo: 'Produção de insumo',
    referencia_id: data.id,
    referencia_tipo: 'producao',
  });

  return data;
}

// =====================================================
// ESTOQUE
// =====================================================

export interface EstoqueComProduto {
  id: string;
  produto_id: string;
  quantidade: number;
  updated_at: string;
  produto: {
    id: string;
    nome: string;
    medida: string | null;
    unidade_medida: string;
  };
}

export async function getEstoque(): Promise<EstoqueComProduto[]> {
  const { data, error } = await supabase
    .from('estoque')
    .select('*, produto:produtos(id, nome, medida, unidade_medida)')
    .order('produto(nome)');

  if (error) throw error;
  return data || [];
}

export async function getEstoqueProduto(produtoId: string): Promise<number> {
  const { data, error } = await supabase
    .from('estoque')
    .select('quantidade')
    .eq('produto_id', produtoId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return 0; // Não encontrado
    throw error;
  }
  return data?.quantidade || 0;
}

async function atualizarEstoque(produtoId: string, quantidade: number, tipo: 'entrada' | 'saida'): Promise<void> {
  // Buscar estoque atual
  const { data: estoqueAtual } = await supabase
    .from('estoque')
    .select('quantidade')
    .eq('produto_id', produtoId)
    .single();

  const quantidadeAtual = estoqueAtual?.quantidade || 0;
  const novaQuantidade = tipo === 'entrada' 
    ? quantidadeAtual + quantidade 
    : Math.max(0, quantidadeAtual - quantidade);

  // Upsert estoque
  const { error } = await supabase
    .from('estoque')
    .upsert({
      produto_id: produtoId,
      quantidade: novaQuantidade,
      updated_at: new Date().toISOString(),
    });

  if (error) throw error;
}

// =====================================================
// MOVIMENTAÇÕES
// =====================================================

export async function getMovimentacoes(limit: number = 50): Promise<(Movimentacao & { produto: { nome: string } })[]> {
  const { data, error } = await supabase
    .from('movimentacoes')
    .select('*, produto:produtos(nome)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

async function registrarMovimentacao(movimentacao: {
  produto_id: string;
  tipo: 'entrada' | 'saida';
  quantidade: number;
  motivo?: string;
  referencia_id?: string;
  referencia_tipo?: string;
}): Promise<void> {
  const { error } = await supabase
    .from('movimentacoes')
    .insert(movimentacao);

  if (error) throw error;
}

// Registrar saída manual
export async function registrarSaida(
  produtoId: string, 
  quantidade: number, 
  motivo: string
): Promise<void> {
  await atualizarEstoque(produtoId, quantidade, 'saida');
  await registrarMovimentacao({
    produto_id: produtoId,
    tipo: 'saida',
    quantidade,
    motivo,
  });
}
