import { supabase } from '@/lib/supabase';
import {
  Produto,
  ProdutoInsert,
  ProdutoUpdate,
  Grupo,
  Familia,
  Conservacao,
} from '@/types/database';

function normalizarUm<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

// Interface para produto com relacionamentos
export interface ProdutoCompleto extends Produto {
  /** Tipos de embalagem (`grupos`) via `produto_grupos` */
  grupos: Grupo[];
  familia: Familia | null;
  conservacoes: Conservacao[];
}

type ProdutoRowDb = Produto & { familias?: Familia | Familia[] | null };
type ProdutoGrupoJoinRow = { grupos: Grupo | Grupo[] | null };

// Buscar todos os produtos
export async function getProdutos(): Promise<ProdutoCompleto[]> {
  const { data: produtos, error } = await supabase
    .from('produtos')
    .select('*, familias(*)')
    .order('nome');

  if (error) throw error;

  const produtosCompletos = await Promise.all(
    (produtos || []).map(async (row: ProdutoRowDb) => {
      const { familias: famRaw, ...produto } = row;
      const [gruposResult, conservacoesResult] = await Promise.all([
        supabase
          .from('produto_grupos')
          .select('grupo_id, grupos(*)')
          .eq('produto_id', produto.id),
        supabase
          .from('conservacoes')
          .select('*')
          .eq('produto_id', produto.id),
      ]);

      return {
        ...produto,
        familia: normalizarUm<Familia>(famRaw),
        grupos: (gruposResult.data || [])
          .map((pg: ProdutoGrupoJoinRow) => normalizarUm<Grupo>(pg.grupos))
          .filter((g): g is Grupo => g != null),
        conservacoes: conservacoesResult.data || [],
      };
    })
  );

  return produtosCompletos;
}

// Buscar produto por ID
export async function getProdutoById(id: string): Promise<ProdutoCompleto | null> {
  const { data: row, error } = await supabase
    .from('produtos')
    .select('*, familias(*)')
    .eq('id', id)
    .single();

  if (error) throw error;
  if (!row) return null;

  const { familias: famRaw, ...produto } = row as ProdutoRowDb;

  const [gruposResult, conservacoesResult] = await Promise.all([
    supabase
      .from('produto_grupos')
      .select('grupo_id, grupos(*)')
      .eq('produto_id', produto.id),
    supabase
      .from('conservacoes')
      .select('*')
      .eq('produto_id', produto.id),
  ]);

  return {
    ...produto,
    familia: normalizarUm<Familia>(famRaw),
    grupos: (gruposResult.data || [])
      .map((pg: ProdutoGrupoJoinRow) => normalizarUm<Grupo>(pg.grupos))
      .filter((g): g is Grupo => g != null),
    conservacoes: conservacoesResult.data || [],
  };
}

// Criar produto
export async function createProduto(
  produto: ProdutoInsert,
  grupoIds: string[],
  conservacoes: { tipo: string; status?: string; dias: number; horas: number; minutos: number }[]
): Promise<Produto> {
  // Inserir produto
  const { data, error } = await supabase
    .from('produtos')
    .insert(produto)
    .select()
    .single();

  if (error) throw error;

  // Vincular grupos
  if (grupoIds.length > 0) {
    const produtoGrupos = grupoIds.map((grupoId) => ({
      produto_id: data.id,
      grupo_id: grupoId,
    }));

    await supabase
      .from('produto_grupos')
      .insert(produtoGrupos);
  }

  // Inserir conservações
  if (conservacoes.length > 0) {
    const conservacoesData = conservacoes.map((c) => ({
      produto_id: data.id,
      tipo: c.tipo as 'resfriado' | 'congelado' | 'ambiente' | 'quente',
      status: c.status,
      dias: c.dias,
      horas: c.horas,
      minutos: c.minutos,
    }));

    await supabase
      .from('conservacoes')
      .insert(conservacoesData);
  }

  // Criar registro de estoque zerado
  await supabase
    .from('estoque')
    .insert({ produto_id: data.id, quantidade: 0 });

  return data;
}

// Atualizar produto
export async function updateProduto(
  id: string,
  produto: ProdutoUpdate,
  grupoIds?: string[],
  conservacoes?: { tipo: string; status?: string; dias: number; horas: number; minutos: number }[]
): Promise<Produto> {
  const { data, error } = await supabase
    .from('produtos')
    .update(produto)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  // Atualizar grupos se fornecidos
  if (grupoIds !== undefined) {
    // Remover vínculos antigos
    await supabase
      .from('produto_grupos')
      .delete()
      .eq('produto_id', id);

    // Criar novos vínculos
    if (grupoIds.length > 0) {
      const produtoGrupos = grupoIds.map((grupoId) => ({
        produto_id: id,
        grupo_id: grupoId,
      }));

      await supabase
        .from('produto_grupos')
        .insert(produtoGrupos);
    }
  }

  // Atualizar conservações se fornecidas
  if (conservacoes !== undefined) {
    // Remover antigas
    await supabase
      .from('conservacoes')
      .delete()
      .eq('produto_id', id);

    // Criar novas
    if (conservacoes.length > 0) {
      const conservacoesData = conservacoes.map((c) => ({
        produto_id: id,
        tipo: c.tipo as 'resfriado' | 'congelado' | 'ambiente' | 'quente',
        status: c.status,
        dias: c.dias,
        horas: c.horas,
        minutos: c.minutos,
      }));

      await supabase
        .from('conservacoes')
        .insert(conservacoesData);
    }
  }

  return data;
}

// Excluir produto
export async function deleteProduto(id: string): Promise<void> {
  const { error } = await supabase
    .from('produtos')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// Buscar grupos
export async function getGrupos(): Promise<Grupo[]> {
  const { data, error } = await supabase
    .from('grupos')
    .select('*')
    .order('nome');

  if (error) throw error;
  return data || [];
}

// Criar grupo
export async function createGrupo(nome: string, cor: string = '#ef4444'): Promise<Grupo> {
  const { data, error } = await supabase
    .from('grupos')
    .insert({ nome, cor })
    .select()
    .single();

  if (error) throw error;
  return data;
}
