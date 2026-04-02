import { supabase } from '@/lib/supabase';
import { Etiqueta, EtiquetaInsert } from '@/types/database';

/** Mesmo critério de `lotes-compra`: produto sem validade no item. */
const DATA_SENTINELA_SEM_VALIDADE = '2999-12-31';

export type UpsertEtiquetaSeparacaoItem = {
  id: string;
  produto_id: string;
  data_validade?: string | null;
};

/**
 * Garante linhas em `etiquetas` (id = id do item) para itens da separação indústria → loja.
 * - `impresso_agora`: marca impressa (fluxo "Imprimir etiquetas").
 * - `manter_impressa_se_existir`: novo registro sai impressa=false; se já existir, não zera impressa=true.
 */
export async function upsertEtiquetasSeparacaoLoja(
  itens: UpsertEtiquetaSeparacaoItem[],
  options: { lote: string; mode: 'impresso_agora' | 'manter_impressa_se_existir' }
): Promise<void> {
  if (itens.length === 0) return;

  const ids = itens.map((i) => i.id);
  const impressaPorId = new Map<string, boolean>();

  if (options.mode === 'manter_impressa_se_existir') {
    const chunkSize = 500;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const slice = ids.slice(i, i + chunkSize);
      const { data, error } = await supabase.from('etiquetas').select('id, impressa').in('id', slice);
      if (error) throw error;
      (data || []).forEach((row: { id: string; impressa: boolean }) => {
        impressaPorId.set(row.id, row.impressa === true);
      });
    }
  }

  const agora = new Date().toISOString();
  const rows: EtiquetaInsert[] = itens.map((item) => {
    const validade =
      item.data_validade && String(item.data_validade).trim()
        ? item.data_validade!
        : DATA_SENTINELA_SEM_VALIDADE;
    const impressa =
      options.mode === 'impresso_agora'
        ? true
        : impressaPorId.get(item.id) === true;

    return {
      id: item.id,
      produto_id: item.produto_id,
      data_producao: agora,
      data_validade: validade,
      lote: options.lote,
      impressa,
      excluida: false,
    };
  });

  const upsertChunk = 200;
  for (let i = 0; i < rows.length; i += upsertChunk) {
    const chunk = rows.slice(i, i + upsertChunk);
    const { error } = await supabase.from('etiquetas').upsert(chunk, { onConflict: 'id' });
    if (error) throw error;
  }
}

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
