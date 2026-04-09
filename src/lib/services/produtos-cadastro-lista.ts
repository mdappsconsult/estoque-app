import { supabase } from '@/lib/supabase';
import { Produto } from '@/types/database';

export interface FamiliaRow {
  id: string;
  nome: string;
  cor: string;
}

export interface GrupoEmb {
  id: string;
  nome: string;
  cor: string;
}

/** Linha agregada para a lista de cadastro de produtos (tela + modal de edição). */
export interface ProdutoComGruposLista extends Produto {
  familia: FamiliaRow | null;
  grupos: GrupoEmb[];
  conservacoes: {
    id: string;
    tipo: string;
    status: string | null;
    dias: number;
    horas: number;
    minutos: number;
  }[];
}

type PgRow = { produto_id?: string; grupos: GrupoEmb | GrupoEmb[] | null };

function joinUm<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function chunkIds<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function mapProdutoCadastroRow(row: Record<string, unknown>): ProdutoComGruposLista {
  const familia = joinUm(row.familia as FamiliaRow | FamiliaRow[] | null);
  const pgList = row.produto_grupos as PgRow[] | null;
  const grupos = (pgList || [])
    .map((pg) => joinUm(pg.grupos))
    .filter((g): g is GrupoEmb => g != null);
  const conservacoes =
    (row.conservacoes as ProdutoComGruposLista['conservacoes'] | null) || [];
  const rest = { ...row };
  delete rest.familia;
  delete rest.produto_grupos;
  delete rest.conservacoes;
  const base = rest as unknown as Produto;
  return {
    ...base,
    origem: base.origem ?? 'AMBOS',
    estoque_minimo: base.estoque_minimo ?? 0,
    custo_referencia: base.custo_referencia ?? null,
    familia,
    grupos,
    conservacoes,
  };
}

const SELECT_COM_EMBEDS = `
  *,
  familia:familias(id, nome, cor),
  produto_grupos(
    grupo_id,
    grupos(id, nome, cor)
  ),
  conservacoes(id, tipo, status, dias, horas, minutos)
`;

/**
 * Lista para `/cadastros/produtos`: **uma** query com embeds (evita N+1 em `produto_grupos` / `conservacoes`).
 * Se o embed falhar, usa fallback em poucos lotes `.in(produto_id, …)`.
 */
export async function fetchProdutosCadastroLista(): Promise<{
  produtos: ProdutoComGruposLista[];
  error: Error | null;
}> {
  const { data, error } = await supabase
    .from('produtos')
    .select(SELECT_COM_EMBEDS)
    .order('nome', { ascending: true });

  if (!error && data) {
    return {
      produtos: (data as Record<string, unknown>[]).map((row) => mapProdutoCadastroRow(row)),
      error: null,
    };
  }

  const { data: prods, error: e2 } = await supabase.from('produtos').select('*').order('nome', {
    ascending: true,
  });
  if (e2 || !prods?.length) {
    return {
      produtos: [],
      error: error ? new Error(error.message) : e2 ? new Error(e2.message) : null,
    };
  }

  const ids = prods.map((p) => p.id as string);
  const famIds = [
    ...new Set(
      prods
        .map((p) => p.familia_id as string | null | undefined)
        .filter((x): x is string => typeof x === 'string' && x.length > 0)
    ),
  ];

  let famMap = new Map<string, FamiliaRow>();
  if (famIds.length > 0) {
    const { data: fams } = await supabase.from('familias').select('id, nome, cor').in('id', famIds);
    famMap = new Map((fams || []).map((f) => [f.id, f as FamiliaRow]));
  }

  const pgByProd = new Map<string, GrupoEmb[]>();
  for (const part of chunkIds(ids, 120)) {
    const { data: rows, error: ePg } = await supabase
      .from('produto_grupos')
      .select('produto_id, grupos(id, nome, cor)')
      .in('produto_id', part);
    if (ePg) {
      return { produtos: [], error: new Error(ePg.message) };
    }
    for (const row of rows || []) {
      const pid = row.produto_id as string;
      const g = joinUm((row as PgRow).grupos);
      if (!g) continue;
      const arr = pgByProd.get(pid) || [];
      arr.push(g);
      pgByProd.set(pid, arr);
    }
  }

  const consByProd = new Map<string, ProdutoComGruposLista['conservacoes']>();
  for (const part of chunkIds(ids, 120)) {
    const { data: rows, error: eC } = await supabase
      .from('conservacoes')
      .select('id, produto_id, tipo, status, dias, horas, minutos')
      .in('produto_id', part);
    if (eC) {
      return { produtos: [], error: new Error(eC.message) };
    }
    for (const row of rows || []) {
      const pid = row.produto_id as string;
      const arr = consByProd.get(pid) || [];
      arr.push({
        id: row.id as string,
        tipo: row.tipo as string,
        status: (row.status as string | null) ?? null,
        dias: Number(row.dias) || 0,
        horas: Number(row.horas) || 0,
        minutos: Number(row.minutos) || 0,
      });
      consByProd.set(pid, arr);
    }
  }

  const produtos: ProdutoComGruposLista[] = prods.map((p) => {
    const row = p as Produto;
    const fid = row.familia_id;
    return {
      ...row,
      origem: row.origem ?? 'AMBOS',
      estoque_minimo: row.estoque_minimo ?? 0,
      custo_referencia: row.custo_referencia ?? null,
      familia: fid ? famMap.get(fid) ?? null : null,
      grupos: pgByProd.get(row.id) || [],
      conservacoes: consByProd.get(row.id) || [],
    };
  });

  return { produtos, error: null };
}
