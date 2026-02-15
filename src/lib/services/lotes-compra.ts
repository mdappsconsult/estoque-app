import { supabase } from '@/lib/supabase';
import { LoteCompra, LoteCompraInsert, ItemInsert } from '@/types/database';
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

  const { error: insertError } = await supabase.from('itens').insert(itens);
  if (insertError) throw insertError;

  // 3. Auditoria
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
