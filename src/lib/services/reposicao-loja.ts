import { supabase } from '@/lib/supabase';

/**
 * Reposição / contagem de loja (só itens de fornecedor / escopo loja).
 * - `escopo_reposicao === 'industria'`: nunca entra.
 * - COMPRA: sempre entra (fornecedor).
 * - PRODUCAO: nunca entra (SKU só indústria, outro time).
 * - AMBOS: só se `escopo_reposicao === 'loja'` (cadastro “Produto de fornecedor”).
 * - Demais origens: só com `escopo_reposicao === 'loja'`.
 */
export function participaReposicaoLoja(
  escopo: string | null | undefined,
  origem?: string | null
): boolean {
  if (escopo === 'industria') return false;

  const o = origem ?? '';
  if (o === 'COMPRA') return true;
  if (o === 'PRODUCAO') return false;
  if (o === 'AMBOS') return escopo === 'loja';
  return escopo === 'loja';
}

export interface LojaProdutoConfigRow {
  id: string;
  loja_id: string;
  produto_id: string;
  ativo_na_loja: boolean;
  estoque_minimo_loja: number;
  produto?: {
    id: string;
    nome: string;
    status: string;
    origem?: string;
    escopo_reposicao?: string;
  } | null;
}

export interface LojaContagemRow {
  id: string;
  loja_id: string;
  produto_id: string;
  quantidade_contada: number;
  contado_por: string | null;
  contado_em: string;
  usuario?: { id: string; nome: string } | null;
}

type ProdutoJoin =
  | { id: string; nome: string; status: string; origem?: string; escopo_reposicao?: string }
  | null
  | Array<{ id: string; nome: string; status: string; origem?: string; escopo_reposicao?: string }>;
type UsuarioJoin = { id: string; nome: string } | null | Array<{ id: string; nome: string }>;

function normalizarJoin<T>(valor: T | T[] | null | undefined): T | null {
  if (!valor) return null;
  return Array.isArray(valor) ? (valor[0] ?? null) : valor;
}

export interface ResumoReposicaoLojaRow {
  produto_id: string;
  produto_nome: string;
  estoque_minimo_loja: number;
  quantidade_contada: number;
  faltante: number;
  contado_em: string | null;
}

const SELECT_LOJA_PRODUTO_CONFIG =
  'id, loja_id, produto_id, ativo_na_loja, estoque_minimo_loja, produto:produtos(id, nome, status, origem, escopo_reposicao)';

type RawLojaProdutoConfigRow = {
  id: string;
  loja_id: string;
  produto_id: string;
  ativo_na_loja: boolean;
  estoque_minimo_loja: number;
  produto: unknown;
};

function mapRowLojaProdutoConfig(row: RawLojaProdutoConfigRow): LojaProdutoConfigRow {
  return {
    id: row.id,
    loja_id: row.loja_id,
    produto_id: row.produto_id,
    ativo_na_loja: row.ativo_na_loja,
    estoque_minimo_loja: row.estoque_minimo_loja,
    produto: normalizarJoin(row.produto as ProdutoJoin),
  };
}

/** Busca todas as linhas da loja (paginado: API Supabase costuma limitar ~1000 por requisição). */
export async function getConfigProdutosLoja(lojaId: string): Promise<LojaProdutoConfigRow[]> {
  const pageSize = 1000;
  const acumulado: LojaProdutoConfigRow[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from('loja_produtos_config')
      .select(SELECT_LOJA_PRODUTO_CONFIG)
      .eq('loja_id', lojaId)
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    const chunk = data || [];
    chunk.forEach((row: RawLojaProdutoConfigRow) => acumulado.push(mapRowLojaProdutoConfig(row)));
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return acumulado;
}

/** Garante uma linha em `loja_produtos_config` para cada produto ativo da lista (mínimo 0, ativo na loja). Idempotente. */
export async function ensureTodosProdutosNaLoja(lojaId: string, produtoIds: string[]): Promise<void> {
  if (!lojaId || produtoIds.length === 0) return;
  const existing = await getConfigProdutosLoja(lojaId);
  const existSet = new Set(existing.map((c) => c.produto_id));
  const missing = produtoIds.filter((id) => !existSet.has(id));
  if (missing.length === 0) return;

  const now = new Date().toISOString();
  const chunkSize = 200;
  for (let i = 0; i < missing.length; i += chunkSize) {
    const slice = missing.slice(i, i + chunkSize);
    const rows = slice.map((produto_id) => ({
      loja_id: lojaId,
      produto_id,
      ativo_na_loja: true,
      estoque_minimo_loja: 0,
      updated_at: now,
    }));
    const { error } = await supabase
      .from('loja_produtos_config')
      .upsert(rows, { onConflict: 'loja_id,produto_id' });
    if (error) throw error;
  }
}

/** IDs de produtos ativos elegíveis para reposição/contagem (mesmo critério do cadastro de mínimos). */
export async function listarIdsProdutosElegiveisReposicaoLoja(): Promise<string[]> {
  const pageSize = 1000;
  const ids: string[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('produtos')
      .select('id, status, origem, escopo_reposicao')
      .eq('status', 'ativo')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const chunk = data || [];
    for (const row of chunk as { id: string; origem?: string; escopo_reposicao?: string }[]) {
      if (participaReposicaoLoja(row.escopo_reposicao, row.origem)) {
        ids.push(row.id);
      }
    }
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return ids;
}

/** Garante `loja_produtos_config` para todos os produtos elegíveis (alinha lista ao cadastro de reposição). */
export async function ensureTodosProdutosElegiveisNaLoja(lojaId: string): Promise<void> {
  const ids = await listarIdsProdutosElegiveisReposicaoLoja();
  await ensureTodosProdutosNaLoja(lojaId, ids);
}

export async function upsertConfigProdutoLoja(input: {
  lojaId: string;
  produtoId: string;
  ativoNaLoja?: boolean;
  estoqueMinimoLoja: number;
}): Promise<void> {
  const { error } = await supabase
    .from('loja_produtos_config')
    .upsert(
      {
        loja_id: input.lojaId,
        produto_id: input.produtoId,
        ativo_na_loja: input.ativoNaLoja ?? true,
        estoque_minimo_loja: Math.max(0, Math.floor(input.estoqueMinimoLoja || 0)),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'loja_id,produto_id' }
    );

  if (error) throw error;
}

export async function removerConfigProdutoLoja(id: string): Promise<void> {
  const { error } = await supabase.from('loja_produtos_config').delete().eq('id', id);
  if (error) throw error;
}

export async function getContagensLoja(lojaId: string): Promise<LojaContagemRow[]> {
  const { data, error } = await supabase
    .from('loja_contagens')
    .select('id, loja_id, produto_id, quantidade_contada, contado_por, contado_em, usuario:usuarios!contado_por(id, nome)')
    .eq('loja_id', lojaId);

  if (error) throw error;
  type RawContagemRow = {
    id: string;
    loja_id: string;
    produto_id: string;
    quantidade_contada: number;
    contado_por: string | null;
    contado_em: string;
    usuario: unknown;
  };
  return (data || []).map((row: RawContagemRow) => ({
    id: row.id,
    loja_id: row.loja_id,
    produto_id: row.produto_id,
    quantidade_contada: row.quantidade_contada,
    contado_por: row.contado_por,
    contado_em: row.contado_em,
    usuario: normalizarJoin(row.usuario as UsuarioJoin),
  })) as LojaContagemRow[];
}

export async function salvarContagensLoja(input: {
  lojaId: string;
  usuarioId: string;
  contagens: Array<{ produtoId: string; quantidadeContada: number }>;
}): Promise<void> {
  if (input.contagens.length === 0) {
    return;
  }

  const nowIso = new Date().toISOString();
  const payload = input.contagens.map((item) => ({
    loja_id: input.lojaId,
    produto_id: item.produtoId,
    quantidade_contada: Math.max(0, Math.floor(item.quantidadeContada || 0)),
    contado_por: input.usuarioId,
    contado_em: nowIso,
    updated_at: nowIso,
  }));

  const { error } = await supabase
    .from('loja_contagens')
    .upsert(payload, { onConflict: 'loja_id,produto_id' });
  if (error) throw error;
}

export async function getResumoReposicaoLoja(lojaId: string): Promise<ResumoReposicaoLojaRow[]> {
  const configs = await getConfigProdutosLoja(lojaId);
  const ativos = configs.filter(
    (item) =>
      item.ativo_na_loja &&
      item.produto?.status !== 'inativo' &&
      participaReposicaoLoja(item.produto?.escopo_reposicao, item.produto?.origem)
  );
  if (ativos.length === 0) return [];

  const produtoIds = ativos.map((item) => item.produto_id);
  const { data: contagensData, error: contagensError } = await supabase
    .from('loja_contagens')
    .select('produto_id, quantidade_contada, contado_em')
    .eq('loja_id', lojaId)
    .in('produto_id', produtoIds);
  if (contagensError) throw contagensError;

  const contagemPorProduto = new Map<string, { quantidade_contada: number; contado_em: string }>();
  (contagensData || []).forEach((contagem) => {
    contagemPorProduto.set(contagem.produto_id, {
      quantidade_contada: contagem.quantidade_contada || 0,
      contado_em: contagem.contado_em || '',
    });
  });

  return ativos
    .map((config) => {
      const contagem = contagemPorProduto.get(config.produto_id);
      const quantidadeContada = contagem?.quantidade_contada ?? 0;
      const minimo = Math.max(0, config.estoque_minimo_loja || 0);
      return {
        produto_id: config.produto_id,
        produto_nome: config.produto?.nome || 'Produto',
        estoque_minimo_loja: minimo,
        quantidade_contada: quantidadeContada,
        faltante: Math.max(minimo - quantidadeContada, 0),
        contado_em: contagem?.contado_em || null,
      };
    })
    .sort((a, b) => a.produto_nome.localeCompare(b.produto_nome, 'pt-BR'));
}
