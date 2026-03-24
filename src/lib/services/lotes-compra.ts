import { supabase } from '@/lib/supabase';
import { LoteCompra, LoteCompraInsert, Item, ItemInsert, EtiquetaInsert } from '@/types/database';
import { gerarTokenQR, gerarTokenShort } from './itens';
import { registrarAuditoria } from './auditoria';

export interface LoteCompraCompleto extends LoteCompra {
  produto?: { id: string; nome: string; validade_dias: number; validade_horas: number; validade_minutos: number };
  local?: { id: string; nome: string };
}

export async function getLotesCompra(): Promise<LoteCompraCompleto[]> {
  const { data, error } = await supabase
    .from('lotes_compra')
    .select('*, produto:produtos(id, nome, validade_dias, validade_horas, validade_minutos), local:locais(id, nome)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Criar lote de compra + gerar itens unitários com QR
export async function criarLoteCompra(
  lote: LoteCompraInsert,
  dataValidade: string | null,
  usuarioId: string
): Promise<{ loteCompra: LoteCompra; itensGerados: number }> {
  if (lote.quantidade <= 0) {
    throw new Error('Quantidade de entrada deve ser maior que zero');
  }
  if (lote.custo_unitario < 0) {
    throw new Error('Custo unitário não pode ser negativo');
  }
  if (!dataValidade) {
    throw new Error('Data de validade é obrigatória para gerar etiquetas');
  }

  // 1. Criar o lote de compra
  const { data: loteCompra, error } = await supabase
    .from('lotes_compra')
    .insert(lote)
    .select()
    .single();
  if (error) throw error;

  // 2. Gerar N itens unitários
  const itens: ItemInsert[] = [];
  for (let i = 0; i < lote.quantidade; i++) {
    itens.push({
      token_qr: gerarTokenQR(),
      token_short: gerarTokenShort(),
      produto_id: lote.produto_id,
      lote_compra_id: loteCompra.id,
      local_atual_id: lote.local_id,
      estado: 'EM_ESTOQUE',
      data_validade: dataValidade || undefined,
      data_producao: new Date().toISOString(),
    });
  }

  const { data: itensCriados, error: insertError } = await supabase.from('itens').insert(itens).select();
  if (insertError) throw insertError;

  // 3. Gerar etiquetas tokenizáveis vinculadas ao item (id da etiqueta = id do item).
  const etiquetas: EtiquetaInsert[] = ((itensCriados || []) as Item[]).map((item) => ({
    id: item.id,
    produto_id: item.produto_id,
    data_producao: item.data_producao || new Date().toISOString(),
    data_validade: item.data_validade || dataValidade,
    lote: lote.lote_fornecedor || null,
    impressa: false,
    excluida: false,
  }));

  if (etiquetas.length > 0) {
    const { error: etiquetasError } = await supabase.from('etiquetas').insert(etiquetas);
    if (etiquetasError) throw etiquetasError;
  }

  // 4. Auditoria
  await registrarAuditoria({
    usuario_id: usuarioId,
    local_id: lote.local_id,
    acao: 'ENTRADA_COMPRA',
    detalhes: {
      lote_compra_id: loteCompra.id,
      produto_id: lote.produto_id,
      quantidade: lote.quantidade,
      custo_unitario: lote.custo_unitario,
    },
  });

  return { loteCompra, itensGerados: lote.quantidade };
}
