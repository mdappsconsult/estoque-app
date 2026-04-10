import { supabase } from '@/lib/supabase';
import { LoteCompra, LoteCompraInsert, Item, ItemInsert, EtiquetaInsert } from '@/types/database';
import { gerarTokenQR, gerarTokenShort } from './itens';
import { registrarAuditoria } from './auditoria';
import { recalcularEstoqueProduto } from './estoque-sync';

const DATA_SENTINELA_SEM_VALIDADE = '2999-12-31';

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

/** Quantidade de linhas em `itens` vinculadas ao lote (QR já emitidos a partir da compra). */
export async function contarItensDoLoteCompra(loteId: string): Promise<number> {
  const { count, error } = await supabase
    .from('itens')
    .select('id', { count: 'exact', head: true })
    .eq('lote_compra_id', loteId);
  if (error) throw error;
  return count ?? 0;
}

export type AtualizarLoteCompraPatch = {
  quantidade: number;
  custo_unitario: number;
  fornecedor: string;
  nota_fiscal: string | null;
  sem_nota_fiscal: boolean;
  motivo_sem_nota: string | null;
  /** Data yyyy-mm-dd ou vazio → sem validade no lote (só se o produto não exigir). */
  data_validade: string | null;
};

/**
 * Corrige dados de um lote já registrado. A quantidade não pode ficar abaixo do número de QR já emitidos deste lote.
 */
export async function atualizarLoteCompra(
  loteId: string,
  patch: AtualizarLoteCompraPatch,
  usuarioId: string
): Promise<LoteCompra> {
  const { data: lote, error: le } = await supabase
    .from('lotes_compra')
    .select('id, produto_id, local_id')
    .eq('id', loteId)
    .single();
  if (le) throw le;
  if (!lote) throw new Error('Lote não encontrado');

  const { data: produto, error: pe } = await supabase
    .from('produtos')
    .select('id, validade_dias, validade_horas, validade_minutos')
    .eq('id', lote.produto_id)
    .single();
  if (pe) throw pe;
  if (!produto) throw new Error('Produto não encontrado');

  const produtoExigeValidade =
    (produto.validade_dias || 0) > 0 ||
    (produto.validade_horas || 0) > 0 ||
    (produto.validade_minutos || 0) > 0;

  const dataVal = dataValidadeParaColunaLote(patch.data_validade);
  if (produtoExigeValidade && !dataVal) {
    throw new Error('Data de validade é obrigatória para este produto');
  }

  if (!patch.fornecedor?.trim()) {
    throw new Error('Fornecedor é obrigatório');
  }
  if (patch.sem_nota_fiscal) {
    if (!patch.motivo_sem_nota?.trim()) {
      throw new Error('Motivo sem nota fiscal é obrigatório');
    }
  } else if (!patch.nota_fiscal?.trim()) {
    throw new Error('Nota fiscal é obrigatória');
  }
  if (patch.quantidade <= 0) {
    throw new Error('Quantidade deve ser maior que zero');
  }
  if (patch.custo_unitario < 0) {
    throw new Error('Custo unitário não pode ser negativo');
  }

  const emitidos = await contarItensDoLoteCompra(loteId);
  if (patch.quantidade < emitidos) {
    throw new Error(
      `Não é possível deixar o lote com menos de ${emitidos} unidade(s): já existem QR emitidos deste lote.`
    );
  }

  const notaFinal = patch.sem_nota_fiscal ? null : patch.nota_fiscal!.trim().toUpperCase();
  const motivoFinal = patch.sem_nota_fiscal ? patch.motivo_sem_nota!.trim() : null;

  const { data: updated, error: ue } = await supabase
    .from('lotes_compra')
    .update({
      quantidade: patch.quantidade,
      custo_unitario: patch.custo_unitario,
      fornecedor: patch.fornecedor.trim(),
      nota_fiscal: notaFinal,
      sem_nota_fiscal: patch.sem_nota_fiscal,
      motivo_sem_nota: motivoFinal,
      data_validade: dataVal,
    })
    .eq('id', loteId)
    .select()
    .single();
  if (ue) throw ue;

  await recalcularEstoqueProduto(lote.produto_id);

  await registrarAuditoria({
    usuario_id: usuarioId,
    local_id: lote.local_id,
    acao: 'ALTERAR_LOTE_COMPRA',
    detalhes: {
      lote_compra_id: loteId,
      produto_id: lote.produto_id,
      quantidade_nova: patch.quantidade,
      qr_ja_emitidos: emitidos,
    },
  });

  return updated;
}

function dataValidadeParaColunaLote(dataValidade: string | null): string | null {
  if (!dataValidade || !String(dataValidade).trim()) return null;
  return String(dataValidade).trim().slice(0, 10);
}

/**
 * Registra a compra (lote) sem gerar itens nem QR.
 * As unidades com QR são emitidas na saída (separação, produção, etc.) via `emitirUnidadesCompraFifo`.
 */
export async function criarLoteCompra(
  lote: LoteCompraInsert,
  dataValidade: string | null,
  usuarioId: string
): Promise<{ loteCompra: LoteCompra; quantidadeRegistrada: number; itensGerados: number }> {
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

  const dataValidadeLote = dataValidadeParaColunaLote(dataValidade);

  const { data: loteCompra, error } = await supabase
    .from('lotes_compra')
    .insert({
      ...lote,
      fornecedor: lote.fornecedor.trim(),
      lote_fornecedor: loteFornecedorFinal,
      data_validade: dataValidadeLote,
      registrado_por: usuarioId,
    })
    .select()
    .single();
  if (error) throw error;

  await recalcularEstoqueProduto(lote.produto_id);

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
      data_validade: dataValidadeLote,
      qr_emitidos_agora: false,
    },
  });

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

  return { loteCompra, quantidadeRegistrada: lote.quantidade, itensGerados: 0 };
}

/**
 * Emite unidades com QR a partir dos lotes de compra no local (FIFO por `created_at` do lote).
 */
export async function emitirUnidadesCompraFifo(
  produtoId: string,
  localId: string,
  quantidade: number,
  usuarioId: string
): Promise<Item[]> {
  if (quantidade <= 0) return [];

  const { data: produto, error: produtoError } = await supabase
    .from('produtos')
    .select('id, validade_dias, validade_horas, validade_minutos')
    .eq('id', produtoId)
    .single();
  if (produtoError) throw produtoError;
  if (!produto) throw new Error('Produto não encontrado');

  const produtoExigeValidade =
    (produto.validade_dias || 0) > 0 ||
    (produto.validade_horas || 0) > 0 ||
    (produto.validade_minutos || 0) > 0;

  const { data: lotes, error: lotesError } = await supabase
    .from('lotes_compra')
    .select('id, quantidade, local_id, data_validade, lote_fornecedor, created_at')
    .eq('produto_id', produtoId)
    .eq('local_id', localId)
    .order('created_at', { ascending: true });
  if (lotesError) throw lotesError;

  const loteIds = (lotes || []).map((l) => l.id);
  const mintCountByLote = new Map<string, number>();
  if (loteIds.length > 0) {
    const { data: mintRows, error: mintErr } = await supabase
      .from('itens')
      .select('lote_compra_id')
      .in('lote_compra_id', loteIds);
    if (mintErr) throw mintErr;
    for (const row of mintRows || []) {
      if (row.lote_compra_id) {
        mintCountByLote.set(row.lote_compra_id, (mintCountByLote.get(row.lote_compra_id) || 0) + 1);
      }
    }
  }

  const lotePorId = new Map((lotes || []).map((l) => [l.id, l]));
  let remaining = quantidade;
  const toInsert: ItemInsert[] = [];

  for (const lote of lotes || []) {
    if (remaining <= 0) break;
    const minted = mintCountByLote.get(lote.id) || 0;
    const avail = Math.max(0, lote.quantidade - minted);
    if (avail <= 0) continue;
    if (produtoExigeValidade && !lote.data_validade) {
      throw new Error(
        'Há lote de compra sem data de validade no cadastro. Corrija a entrada de compra ou o lote no Supabase antes de emitir QR.'
      );
    }
    const take = Math.min(remaining, avail);
    const dataValItem = produtoExigeValidade ? lote.data_validade : null;
    for (let i = 0; i < take; i++) {
      toInsert.push({
        token_qr: gerarTokenQR(),
        token_short: gerarTokenShort(),
        produto_id: produtoId,
        lote_compra_id: lote.id,
        local_atual_id: localId,
        estado: 'EM_ESTOQUE',
        data_validade: dataValItem,
        data_producao: new Date().toISOString(),
      });
    }
    remaining -= take;
  }

  if (remaining > 0) {
    throw new Error(
      'Saldo em lotes de compra insuficiente para emitir todas as unidades. Registre a compra ou reduza a quantidade.'
    );
  }

  const { data: criados, error: insErr } = await supabase.from('itens').insert(toInsert).select();
  if (insErr) throw insErr;
  const itensCriados = (criados || []) as Item[];

  const etiquetas: EtiquetaInsert[] = itensCriados.map((item) => {
    const lc = item.lote_compra_id ? lotePorId.get(item.lote_compra_id) : undefined;
    const dataEtiqueta = produtoExigeValidade
      ? (item.data_validade || lc?.data_validade || DATA_SENTINELA_SEM_VALIDADE).toString().slice(0, 10)
      : DATA_SENTINELA_SEM_VALIDADE;
    return {
      id: item.id,
      produto_id: item.produto_id,
      data_producao: item.data_producao || new Date().toISOString(),
      data_validade: dataEtiqueta,
      lote: lc?.lote_fornecedor || null,
      impressa: false,
      excluida: false,
    };
  });

  if (etiquetas.length > 0) {
    const { error: etErr } = await supabase.from('etiquetas').insert(etiquetas);
    if (etErr) throw etErr;
  }

  await recalcularEstoqueProduto(produtoId);

  await registrarAuditoria({
    usuario_id: usuarioId,
    local_id: localId,
    acao: 'EMITIR_UNIDADES_COMPRA',
    detalhes: {
      produto_id: produtoId,
      quantidade,
      origem: 'lotes_compra_fifo',
    },
  });

  return itensCriados;
}

/** Garante pelo menos `quantidadeNecessaria` itens EM_ESTOQUE no local, emitindo QR a partir de compras se faltar. */
export async function garantirItensDisponiveisNoLocal(input: {
  produtoId: string;
  localId: string;
  quantidadeNecessaria: number;
  excluirItemIds?: Set<string>;
  usuarioId: string;
}): Promise<void> {
  const { produtoId, localId, quantidadeNecessaria, excluirItemIds, usuarioId } = input;
  if (quantidadeNecessaria <= 0) return;

  const { data: rows, error } = await supabase
    .from('itens')
    .select('id')
    .eq('produto_id', produtoId)
    .eq('local_atual_id', localId)
    .eq('estado', 'EM_ESTOQUE')
    .order('created_at', { ascending: true })
    .limit(30000);
  if (error) throw error;

  const disponiveis = (rows || []).filter((r) => !excluirItemIds?.has(r.id)).length;
  const falta = quantidadeNecessaria - disponiveis;
  if (falta > 0) {
    await emitirUnidadesCompraFifo(produtoId, localId, falta, usuarioId);
  }
}
