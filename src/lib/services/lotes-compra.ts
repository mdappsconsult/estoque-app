import { supabase } from '@/lib/supabase';
import { LoteCompra, LoteCompraInsert, Item, ItemInsert, EtiquetaInsert } from '@/types/database';
import { gerarTokenQR, gerarTokenShort } from './itens';
import { registrarAuditoria } from './auditoria';
import { recalcularEstoqueProduto } from './estoque-sync';

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
  const DATA_SENTINELA_SEM_VALIDADE = '2999-12-31';
  const gerarLoteInterno = (): string => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    const r = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `L${y}${m}${day}-${h}${min}${s}-${r}`;
  };

  const loteFornecedorFinal =
    typeof lote.lote_fornecedor === 'string' && lote.lote_fornecedor.trim()
      ? lote.lote_fornecedor.trim().toUpperCase()
      : gerarLoteInterno();

  if (!lote.fornecedor || !lote.fornecedor.trim()) {
    throw new Error('Fornecedor é obrigatório');
  }
  if (lote.sem_nota_fiscal) {
    if (!lote.motivo_sem_nota || !lote.motivo_sem_nota.trim()) {
      throw new Error('Motivo sem nota fiscal é obrigatório');
    }
  } else if (!lote.nota_fiscal || !lote.nota_fiscal.trim()) {
    throw new Error('Nota fiscal é obrigatória');
  }
  if (lote.quantidade <= 0) {
    throw new Error('Quantidade de entrada deve ser maior que zero');
  }
  if (lote.custo_unitario < 0) {
    throw new Error('Custo unitário não pode ser negativo');
  }

  const { data: produto, error: produtoError } = await supabase
    .from('produtos')
    .select('id, validade_dias, validade_horas, validade_minutos')
    .eq('id', lote.produto_id)
    .single();
  if (produtoError) throw produtoError;
  if (!produto) {
    throw new Error('Produto não encontrado');
  }

  const produtoExigeValidade =
    (produto.validade_dias || 0) > 0 ||
    (produto.validade_horas || 0) > 0 ||
    (produto.validade_minutos || 0) > 0;
  if (produtoExigeValidade && !dataValidade) {
    throw new Error('Data de validade é obrigatória para este produto');
  }

  // 1. Criar o lote de compra
  const { data: loteCompra, error } = await supabase
    .from('lotes_compra')
    .insert({
      ...lote,
      fornecedor: lote.fornecedor.trim(),
      lote_fornecedor: loteFornecedorFinal,
    })
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
      data_validade: dataValidade || null,
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
    data_validade: produtoExigeValidade
      ? (item.data_validade || dataValidade || new Date().toISOString().slice(0, 10))
      : DATA_SENTINELA_SEM_VALIDADE,
    lote: lote.lote_fornecedor || null,
    impressa: false,
    excluida: false,
  }));

  if (etiquetas.length > 0) {
    const { error: etiquetasError } = await supabase.from('etiquetas').insert(etiquetas);
    if (etiquetasError) throw etiquetasError;
  }

  // 3.1) Recalcular estoque agregado do produto para manter consistência da tela/relatórios.
  await recalcularEstoqueProduto(lote.produto_id);

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
      exige_validade: produtoExigeValidade,
      data_validade: dataValidade,
    },
  });

  // Atualiza custo de referência no cadastro (última compra registrada)
  const { error: erroCustoRef } = await supabase
    .from('produtos')
    .update({
      custo_referencia: lote.custo_unitario,
      updated_at: new Date().toISOString(),
    })
    .eq('id', lote.produto_id);
  if (erroCustoRef) {
    console.warn('Não foi possível atualizar custo_referencia do produto:', erroCustoRef.message);
  }

  return { loteCompra, itensGerados: lote.quantidade };
}
