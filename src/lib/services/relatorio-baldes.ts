import { supabase } from '@/lib/supabase';

export type RelatorioBaldesRow = {
  loja_id: string;
  loja_nome: string;
  produto_id: string;
  produto_nome: string;
  qtd_industria_em_estoque: number;
  qtd_loja_em_estoque: number;
  qtd_em_transferencia_para_loja: number;
  qtd_utilizados_periodo: number;
};

export async function getRelatorioBaldes(input: {
  dataIni: string; // YYYY-MM-DD
  dataFim: string; // YYYY-MM-DD
  lojaId?: string | null;
  produtoId?: string | null;
  apenasNomeBalde?: boolean;
  localIndustriaId?: string | null;
}): Promise<RelatorioBaldesRow[]> {
  const { data, error } = await supabase.rpc('relatorio_baldes', {
    p_data_ini: input.dataIni,
    p_data_fim: input.dataFim,
    p_loja_id: input.lojaId ?? null,
    p_produto_id: input.produtoId ?? null,
    p_apenas_nome_balde: input.apenasNomeBalde ?? true,
    p_local_industria_id: input.localIndustriaId ?? null,
  });

  if (error) throw error;
  return (data || []) as RelatorioBaldesRow[];
}

