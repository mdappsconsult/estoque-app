import { supabase } from '@/lib/supabase';
import { Etiqueta, EtiquetaInsert } from '@/types/database';

export interface EtiquetaCompleta extends Etiqueta {
  produto: {
    id: string;
    nome: string;
    medida: string | null;
    unidade_medida: string;
  };
}

// Buscar etiquetas
export async function getEtiquetas(filtros?: {
  impressa?: boolean;
  excluida?: boolean;
  produtoId?: string;
}): Promise<EtiquetaCompleta[]> {
  let query = supabase
    .from('etiquetas')
    .select('*, produto:produtos(id, nome, medida, unidade_medida)')
    .order('created_at', { ascending: false });

  if (filtros?.impressa !== undefined) {
    query = query.eq('impressa', filtros.impressa);
  }
  if (filtros?.excluida !== undefined) {
    query = query.eq('excluida', filtros.excluida);
  }
  if (filtros?.produtoId) {
    query = query.eq('produto_id', filtros.produtoId);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

// Criar etiqueta
export async function createEtiqueta(etiqueta: EtiquetaInsert): Promise<Etiqueta> {
  const { data, error } = await supabase
    .from('etiquetas')
    .insert(etiqueta)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Criar múltiplas etiquetas
export async function createEtiquetas(etiquetas: EtiquetaInsert[]): Promise<Etiqueta[]> {
  const { data, error } = await supabase
    .from('etiquetas')
    .insert(etiquetas)
    .select();

  if (error) throw error;
  return data || [];
}

// Marcar etiqueta como impressa
export async function marcarEtiquetaImpressa(id: string): Promise<void> {
  const { error } = await supabase
    .from('etiquetas')
    .update({ impressa: true })
    .eq('id', id);

  if (error) throw error;
}

// Marcar múltiplas etiquetas como impressas
export async function marcarEtiquetasImpressas(ids: string[]): Promise<void> {
  const { error } = await supabase
    .from('etiquetas')
    .update({ impressa: true })
    .in('id', ids);

  if (error) throw error;
}

// Excluir etiqueta (soft delete)
export async function excluirEtiqueta(id: string): Promise<void> {
  const { error } = await supabase
    .from('etiquetas')
    .update({ excluida: true })
    .eq('id', id);

  if (error) throw error;
}

// Buscar etiquetas próximas do vencimento
export async function getEtiquetasProximasVencimento(dias: number = 7): Promise<EtiquetaCompleta[]> {
  const dataLimite = new Date();
  dataLimite.setDate(dataLimite.getDate() + dias);

  const { data, error } = await supabase
    .from('etiquetas')
    .select('*, produto:produtos(id, nome, medida, unidade_medida)')
    .eq('excluida', false)
    .lte('data_validade', dataLimite.toISOString())
    .gte('data_validade', new Date().toISOString())
    .order('data_validade', { ascending: true });

  if (error) throw error;
  return data || [];
}

// Gerar lote automaticamente
export function gerarLote(): string {
  const data = new Date();
  const ano = data.getFullYear().toString().slice(-2);
  const mes = (data.getMonth() + 1).toString().padStart(2, '0');
  const dia = data.getDate().toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `L${ano}${mes}${dia}${random}`;
}
