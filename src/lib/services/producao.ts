import { supabase } from '@/lib/supabase';
import { registrarAuditoria } from './auditoria';
import { gerarTokenQR, gerarTokenShort } from './itens';
import { gerarLote } from './etiquetas';
import { EtiquetaInsert, Item } from '@/types/database';
import { recalcularEstoqueProduto, recalcularEstoqueProdutos } from './estoque-sync';
import { garantirItensDisponiveisNoLocal } from './lotes-compra';
import { calcularDataValidadeYmdAposDiasCorridosBr } from '@/lib/datas/validade-producao-br';

export interface ConsumoProducaoLinha {
  produtoId: string;
  quantidade: number;
}

interface RegistrarProducaoInput {
  produtoId: string;
  /** Número de baldes (1 balde = 1 unidade com QR do acabado nesta versão). */
  numBaldes: number;
  localId: string;
  consumos: ConsumoProducaoLinha[];
  dataValidade?: string | null;
  diasValidade?: number | null;
  observacoes?: string | null;
  usuarioId: string;
  responsavelNome: string;
}

export interface EtiquetaGeradaProducao {
  id: string;
  produtoId: string;
  dataProducao: string;
  dataValidade: string;
  lote: string;
  tokenQr: string;
  tokenShort: string | null;
  numeroLoteProducao: number;
  sequenciaNoLote: number;
  numBaldesLote: number;
  dataLoteProducaoIso: string;
}

function mergeConsumos(linhas: ConsumoProducaoLinha[]): ConsumoProducaoLinha[] {
  const map = new Map<string, number>();
  for (const linha of linhas) {
    const q = linha.quantidade;
    if (!linha.produtoId || !Number.isFinite(q) || q <= 0) continue;
    map.set(linha.produtoId, (map.get(linha.produtoId) || 0) + Math.floor(q));
  }
  return [...map.entries()].map(([produtoId, quantidade]) => ({ produtoId, quantidade }));
}

async function selecionarItensFefo(
  produtoId: string,
  localId: string,
  quantidade: number
): Promise<string[]> {
  const { data, error } = await supabase
    .from('itens')
    .select('id')
    .eq('produto_id', produtoId)
    .eq('local_atual_id', localId)
    .eq('estado', 'EM_ESTOQUE')
    .order('created_at', { ascending: true })
    .limit(quantidade);

  if (error) throw error;
  const rows = data || [];
  if (rows.length < quantidade) {
    throw new Error(
      `Estoque insuficiente para um insumo (produto ${produtoId.slice(0, 8)}…): precisa ${quantidade}, há ${rows.length} unidade(s) no local.`
    );
  }
  return rows.map((r) => r.id);
}

export async function registrarProducaoComItens(input: RegistrarProducaoInput): Promise<EtiquetaGeradaProducao[]> {
  if (input.numBaldes <= 0 || !Number.isInteger(input.numBaldes)) {
    throw new Error('Número de baldes deve ser um inteiro maior que zero');
  }

  const consumosMerged = mergeConsumos(input.consumos);
  if (consumosMerged.length === 0) {
    throw new Error('Informe ao menos um insumo com quantidade utilizada (unidades com QR)');
  }

  for (const c of consumosMerged) {
    if (c.produtoId === input.produtoId) {
      throw new Error('Não use o produto acabado como insumo da mesma produção');
    }
  }

  const dataValidadeCalculada =
    input.dataValidade ||
    (typeof input.diasValidade === 'number'
      ? calcularDataValidadeYmdAposDiasCorridosBr(input.diasValidade)
      : null);
  if (!dataValidadeCalculada) {
    throw new Error('Informe a data de validade ou os dias de validade');
  }

  const quantidadeAcabado = input.numBaldes;

  for (const c of consumosMerged) {
    await garantirItensDisponiveisNoLocal({
      produtoId: c.produtoId,
      localId: input.localId,
      quantidadeNecessaria: c.quantidade,
      usuarioId: input.usuarioId,
    });
  }

  const selecoesPorProduto = await Promise.all(
    consumosMerged.map(async (c) => ({
      produtoId: c.produtoId,
      itemIds: await selecionarItensFefo(c.produtoId, input.localId, c.quantidade),
    }))
  );

  const todosItemIdsConsumidos = selecoesPorProduto.flatMap((s) => s.itemIds);
  const produtosInsumos = [...new Set(consumosMerged.map((c) => c.produtoId))];

  const { data: rpcNumero, error: rpcLoteErr } = await supabase.rpc('reservar_numero_lote_producao', {
    p_produto_id: input.produtoId,
    p_local_id: input.localId,
  });
  if (rpcLoteErr) throw rpcLoteErr;
  const numeroLoteProducao =
    typeof rpcNumero === 'number'
      ? rpcNumero
      : typeof rpcNumero === 'string'
        ? parseInt(rpcNumero, 10)
        : NaN;
  if (!Number.isFinite(numeroLoteProducao)) {
    throw new Error('Falha ao reservar número de lote de produção.');
  }

  const baseProducao = {
    produto_id: input.produtoId,
    quantidade: quantidadeAcabado,
    num_baldes: input.numBaldes,
    local_id: input.localId,
    responsavel: input.responsavelNome,
    observacoes: input.observacoes || null,
  };

  const { data: producaoRow, error: producaoErr } = await supabase
    .from('producoes')
    .insert({
      ...baseProducao,
      registrado_por: input.usuarioId,
      numero_lote_producao: numeroLoteProducao,
    })
    .select('id, created_at, numero_lote_producao')
    .single();

  if (producaoErr) throw producaoErr;
  if (!producaoRow?.id) throw new Error('Resposta inválida ao gravar produção');
  const producaoId = producaoRow.id;
  const dataLoteProducaoIso = String((producaoRow as { created_at?: string }).created_at || '');

  const { error: updErr } = await supabase
    .from('itens')
    .update({ estado: 'BAIXADO' })
    .in('id', todosItemIdsConsumidos);
  if (updErr) throw updErr;

  const baixasPayload = todosItemIdsConsumidos.map((itemId) => ({
    item_id: itemId,
    local_id: input.localId,
    usuario_id: input.usuarioId,
    producao_id: producaoId,
  }));

  const { error: baixasErr } = await supabase.from('baixas').insert(baixasPayload);
  if (baixasErr) throw baixasErr;

  const consumoPayload = todosItemIdsConsumidos.map((itemId) => ({
    producao_id: producaoId,
    item_id: itemId,
  }));
  const { error: consumoErr } = await supabase.from('producao_consumo_itens').insert(consumoPayload);
  if (consumoErr) throw consumoErr;

  await recalcularEstoqueProdutos(produtosInsumos);

  const auditoriaBaixas = todosItemIdsConsumidos.map((itemId) => ({
    usuario_id: input.usuarioId,
    local_id: input.localId,
    acao: 'BAIXA',
    item_id: itemId,
    detalhes: { producao_id: producaoId, motivo: 'consumo_producao' } as Record<string, unknown>,
  }));
  const chunkAud = 80;
  for (let i = 0; i < auditoriaBaixas.length; i += chunkAud) {
    const slice = auditoriaBaixas.slice(i, i + chunkAud);
    const { error: audErr } = await supabase.from('auditoria').insert(slice);
    if (audErr) console.error('Erro ao registrar auditoria de baixas da produção:', audErr);
  }

  const itensAcabado = Array.from({ length: quantidadeAcabado }, (_, idx) => ({
    token_qr: gerarTokenQR(),
    token_short: gerarTokenShort(),
    produto_id: input.produtoId,
    local_atual_id: input.localId,
    estado: 'EM_ESTOQUE' as const,
    data_validade: dataValidadeCalculada,
    data_producao: new Date().toISOString(),
    producao_id: producaoId,
    sequencia_no_lote_producao: idx + 1,
  }));

  const { data: itensCriados, error: itensError } = await supabase.from('itens').insert(itensAcabado).select();
  if (itensError) throw itensError;
  const itensGerados = (itensCriados || []) as Item[];

  const loteProducao = gerarLote();

  const etiquetas: EtiquetaInsert[] = itensGerados.map((item, idx) => ({
    id: item.id,
    produto_id: item.produto_id,
    data_producao: item.data_producao || new Date().toISOString(),
    data_validade: item.data_validade || dataValidadeCalculada,
    lote: loteProducao,
    impressa: false,
    excluida: false,
    lote_producao_numero: numeroLoteProducao,
    sequencia_no_lote_producao: idx + 1,
    data_lote_producao: dataLoteProducaoIso || null,
    num_baldes_lote_producao: quantidadeAcabado,
  }));

  if (etiquetas.length > 0) {
    const { error: etiquetasError } = await supabase.from('etiquetas').insert(etiquetas);
    if (etiquetasError) throw etiquetasError;
  }

  await recalcularEstoqueProduto(input.produtoId);

  await registrarAuditoria({
    usuario_id: input.usuarioId,
    local_id: input.localId,
    acao: 'PRODUCAO',
    detalhes: {
      producao_id: producaoId,
      produto_id: input.produtoId,
      quantidade: quantidadeAcabado,
      num_baldes: input.numBaldes,
      numero_lote_producao: numeroLoteProducao,
      dias_validade: input.diasValidade ?? null,
      data_validade: dataValidadeCalculada,
      consumos: consumosMerged.map((c) => ({ produto_id: c.produtoId, quantidade: c.quantidade })),
      itens_consumidos: todosItemIdsConsumidos.length,
    },
  });

  return itensGerados.map((item, idx) => ({
    id: item.id,
    produtoId: item.produto_id,
    dataProducao: item.data_producao || new Date().toISOString(),
    dataValidade: item.data_validade || dataValidadeCalculada,
    lote: loteProducao,
    tokenQr: item.token_qr,
    tokenShort: item.token_short || null,
    numeroLoteProducao,
    sequenciaNoLote: idx + 1,
    numBaldesLote: quantidadeAcabado,
    dataLoteProducaoIso: dataLoteProducaoIso || new Date().toISOString(),
  }));
}
