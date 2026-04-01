import { supabase } from '@/lib/supabase';

export interface ResumoEstoqueRow {
  produto_id: string;
  produto_nome: string;
  local_id: string | null;
  local_nome: string | null;
  local_tipo: string | null;
  quantidade: number;
  proxima_validade: string | null;
}

export interface ResumoEstoqueMinimoRow {
  produto_id: string;
  produto_nome: string;
  local_id: string | null;
  local_nome: string | null;
  local_tipo: string | null;
  quantidade_atual: number;
  estoque_minimo: number;
  faltante: number;
}

interface GetResumoEstoqueInput {
  estado?: string | null;
  localId?: string | null;
  busca?: string | null;
}

export async function getResumoEstoqueAgrupado(
  input: GetResumoEstoqueInput = {}
): Promise<ResumoEstoqueRow[]> {
  const { data, error } = await supabase.rpc('resumo_estoque_agrupado', {
    p_estado: input.estado || null,
    p_local_id: input.localId || null,
    p_busca: input.busca?.trim() || null,
  });

  if (error) throw error;
  return (data || []) as ResumoEstoqueRow[];
}

interface GetResumoEstoqueMinimoInput {
  localId?: string | null;
  busca?: string | null;
  apenasAbaixo?: boolean;
}

export async function getResumoEstoqueMinimo(
  input: GetResumoEstoqueMinimoInput = {}
): Promise<ResumoEstoqueMinimoRow[]> {
  const { data, error } = await supabase.rpc('resumo_estoque_minimo', {
    p_local_id: input.localId || null,
    p_busca: input.busca?.trim() || null,
    p_apenas_abaixo: input.apenasAbaixo ?? true,
  });

  if (error) throw error;
  return (data || []) as ResumoEstoqueMinimoRow[];
}
