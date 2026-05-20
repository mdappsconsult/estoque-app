import { supabase } from '@/lib/supabase';
import { registrarAuditoria } from './auditoria';
import { gerarTokenQR, gerarTokenShort } from './itens';
import { gerarLote } from './etiquetas';
import type { EtiquetaInsert, Item } from '@/types/database';
import { recalcularEstoqueProdutos } from './estoque-sync';
import { calcularDataValidadeIsoMeiaNoiteBrAposDiasCorridos } from '@/lib/datas/validade-producao-br';
import { assertItensSemVinculoRemessaAberta } from './transferencias';
import type { EtiquetaGeradaProducao } from './producao';

const IN_CHUNK = 100;

export interface RegistrarEnvaseCaixasInput {
  usuarioId: string;
  responsavelNome: string;
  localId: string;
  produtoCaixaId: string;
  produtoBaldeId: string;
  /** Quantos baldes inteiros viram uma caixa (ex.: 2). */
  baldesPorCaixa: number;
  diasValidade: number;
  observacoes?: string | null;
  /** IDs dos itens (balde) na ordem escaneada; tamanho deve ser múltiplo de `baldesPorCaixa`. */
  itemIdsBalde: string[];
}

async function carregarItensParaValidacao(
  itemIds: string[]
): Promise<Map<string, { id: string; produto_id: string; local_atual_id: string | null; estado: string }>> {
  const map = new Map<string, { id: string; produto_id: string; local_atual_id: string | null; estado: string }>();
  for (let i = 0; i < itemIds.length; i += IN_CHUNK) {
    const slice = itemIds.slice(i, i + IN_CHUNK);
    const { data, error } = await supabase
      .from('itens')
      .select('id, produto_id, local_atual_id, estado')
      .in('id', slice);
    if (error) throw error;
    for (const row of data || []) {
      const r = row as {
        id: string;
        produto_id: string;
        local_atual_id: string | null;
        estado: string;
      };
      map.set(r.id, r);
    }
  }
  return map;
}

/**
 * Registra envase: baixa explícita dos baldes (QR) e gera caixas com QR + etiquetas no **mesmo** local (indústria).
 * Não usa a regra de família «Insumo Indústria» — o balde é acabado rastreado por item.
 */
export async function registrarEnvaseCaixasComBalde(
  input: RegistrarEnvaseCaixasInput
): Promise<{
  producaoId: string;
  numeroLoteProducao: number;
  numCaixas: number;
  numBaldesConsumidos: number;
  baldesPorCaixa: number;
  produtoCaixaId: string;
  produtoBaldeId: string;
  etiquetas: EtiquetaGeradaProducao[];
}> {
  const {
    usuarioId,
    responsavelNome,
    localId,
    produtoCaixaId,
    produtoBaldeId,
    baldesPorCaixa,
    diasValidade,
    observacoes,
  } = input;

  const itemIdsBalde = [...new Set(input.itemIdsBalde.map((id) => id.trim()).filter(Boolean))];
  if (itemIdsBalde.length === 0) {
    throw new Error('Escaneie ou informe ao menos um balde (QR).');
  }
  if (itemIdsBalde.length !== input.itemIdsBalde.length) {
    throw new Error('Há códigos duplicados na lista de baldes.');
  }

  if (!Number.isInteger(baldesPorCaixa) || baldesPorCaixa < 1) {
    throw new Error('«Baldes por caixa» deve ser um número inteiro ≥ 1.');
  }

  if (itemIdsBalde.length % baldesPorCaixa !== 0) {
    throw new Error(
      `Quantidade de baldes (${itemIdsBalde.length}) não é múltipla de «baldes por caixa» (${baldesPorCaixa}). Ajuste os bips ou a proporção.`
    );
  }

  if (!Number.isInteger(diasValidade) || diasValidade < 1) {
    throw new Error('Informe validade em dias (inteiro ≥ 1).');
  }

  if (produtoCaixaId === produtoBaldeId) {
    throw new Error('O produto da caixa deve ser diferente do produto do balde.');
  }

  const { data: produtosRow, error: prodErr } = await supabase
    .from('produtos')
    .select('id, nome, origem, status')
    .in('id', [produtoCaixaId, produtoBaldeId]);
  if (prodErr) throw prodErr;
  const porProd = new Map((produtosRow || []).map((p) => [(p as { id: string }).id, p as { id: string; nome: string; origem: string | null; status: string }]));
  const pCaixa = porProd.get(produtoCaixaId);
  const pBalde = porProd.get(produtoBaldeId);
  if (!pCaixa || !pBalde) throw new Error('Produto caixa ou balde não encontrado.');
  if (pCaixa.status !== 'ativo' || pBalde.status !== 'ativo') {
    throw new Error('Produto caixa e balde devem estar ativos.');
  }
  const origemOk = (o: string | null) => o === 'PRODUCAO' || o === 'AMBOS';
  if (!origemOk(pCaixa.origem) || !origemOk(pBalde.origem)) {
    throw new Error('Produtos devem ter origem «Produção» ou «Compra e produção».');
  }

  await assertItensSemVinculoRemessaAberta(itemIdsBalde, supabase);

  const itensMap = await carregarItensParaValidacao(itemIdsBalde);
  if (itensMap.size !== itemIdsBalde.length) {
    throw new Error('Um ou mais itens (balde) não foram encontrados.');
  }

  for (const id of itemIdsBalde) {
    const it = itensMap.get(id)!;
    if (it.estado !== 'EM_ESTOQUE') {
      throw new Error(`O item ${it.id.slice(0, 8)}… não está em estoque (estado: ${it.estado}).`);
    }
    if (it.local_atual_id !== localId) {
      throw new Error(`O balde ${it.id.slice(0, 8)}… não está neste local de produção.`);
    }
    if (it.produto_id !== produtoBaldeId) {
      throw new Error(
        `O QR lido não é do produto balde selecionado («${pBalde.nome}»). Remova o item e escaneie só baldes desse produto.`
      );
    }
  }

  const dataValidadeCalculada = calcularDataValidadeIsoMeiaNoiteBrAposDiasCorridos(diasValidade);
  const numCaixas = itemIdsBalde.length / baldesPorCaixa;

  const { data: rpcNumero, error: rpcLoteErr } = await supabase.rpc('reservar_numero_lote_producao', {
    p_produto_id: produtoCaixaId,
    p_local_id: localId,
  });
  if (rpcLoteErr) throw rpcLoteErr;
  const numeroLoteProducao =
    typeof rpcNumero === 'number'
      ? rpcNumero
      : typeof rpcNumero === 'string'
        ? parseInt(rpcNumero, 10)
        : NaN;
  if (!Number.isFinite(numeroLoteProducao)) {
    throw new Error('Falha ao reservar número de lote de produção (caixa).');
  }

  const baseProducao = {
    produto_id: produtoCaixaId,
    quantidade: numCaixas,
    num_baldes: numCaixas,
    local_id: localId,
    responsavel: responsavelNome,
    observacoes: observacoes?.trim() || null,
    tipo: 'ENVASE_CAIXA' as const,
    envase_produto_balde_id: produtoBaldeId,
    envase_baldes_por_caixa: baldesPorCaixa,
  };

  const { data: producaoRow, error: producaoErr } = await supabase
    .from('producoes')
    .insert({
      ...baseProducao,
      registrado_por: usuarioId,
      numero_lote_producao: numeroLoteProducao,
    })
    .select('id, created_at, numero_lote_producao')
    .single();

  if (producaoErr) throw producaoErr;
  if (!producaoRow?.id) throw new Error('Resposta inválida ao gravar produção (envase).');
  const producaoId = producaoRow.id as string;
  const dataLoteProducaoIso = String((producaoRow as { created_at?: string }).created_at || '');

  const { error: updErr } = await supabase.from('itens').update({ estado: 'BAIXADO' }).in('id', itemIdsBalde);
  if (updErr) throw updErr;

  const baixasPayload = itemIdsBalde.map((itemId) => ({
    item_id: itemId,
    local_id: localId,
    usuario_id: usuarioId,
    producao_id: producaoId,
  }));
  const { error: baixasErr } = await supabase.from('baixas').insert(baixasPayload);
  if (baixasErr) throw baixasErr;

  const consumoPayload = itemIdsBalde.map((itemId) => ({
    producao_id: producaoId,
    item_id: itemId,
  }));
  const { error: consumoErr } = await supabase.from('producao_consumo_itens').insert(consumoPayload);
  if (consumoErr) throw consumoErr;

  await recalcularEstoqueProdutos([produtoBaldeId]);

  const auditoriaBaixas = itemIdsBalde.map((itemId) => ({
    usuario_id: usuarioId,
    local_id: localId,
    acao: 'BAIXA' as const,
    item_id: itemId,
    detalhes: { producao_id: producaoId, motivo: 'consumo_envase_caixa' } as Record<string, unknown>,
  }));
  const chunkAud = 80;
  for (let i = 0; i < auditoriaBaixas.length; i += chunkAud) {
    const slice = auditoriaBaixas.slice(i, i + chunkAud);
    const { error: audErr } = await supabase.from('auditoria').insert(slice);
    if (audErr) console.error('[envase-caixa] auditoria baixas:', audErr.message);
  }

  const itensAcabado = Array.from({ length: numCaixas }, (_, idx) => ({
    token_qr: gerarTokenQR(),
    token_short: gerarTokenShort(),
    produto_id: produtoCaixaId,
    local_atual_id: localId,
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
    num_baldes_lote_producao: numCaixas,
  }));

  if (etiquetas.length > 0) {
    const { error: etiquetasError } = await supabase.from('etiquetas').insert(etiquetas);
    if (etiquetasError) throw etiquetasError;
  }

  await recalcularEstoqueProdutos([produtoCaixaId]);

  await registrarAuditoria({
    usuario_id: usuarioId,
    local_id: localId,
    acao: 'PRODUCAO',
    detalhes: {
      tipo: 'ENVASE_CAIXA',
      producao_id: producaoId,
      produto_caixa_id: produtoCaixaId,
      produto_balde_id: produtoBaldeId,
      baldes_por_caixa: baldesPorCaixa,
      num_caixas: numCaixas,
      num_baldes_consumidos: itemIdsBalde.length,
      numero_lote_producao: numeroLoteProducao,
      dias_validade: diasValidade,
      data_validade: dataValidadeCalculada,
    },
  });

  return {
    producaoId,
    numeroLoteProducao,
    numCaixas,
    numBaldesConsumidos: itemIdsBalde.length,
    baldesPorCaixa,
    produtoCaixaId,
    produtoBaldeId,
    etiquetas: itensGerados.map((item, idx) => ({
      id: item.id,
      produtoId: item.produto_id,
      dataProducao: item.data_producao || new Date().toISOString(),
      dataValidade: item.data_validade || dataValidadeCalculada,
      lote: loteProducao,
      tokenQr: item.token_qr,
      tokenShort: item.token_short || null,
      numeroLoteProducao,
      sequenciaNoLote: idx + 1,
      numBaldesLote: numCaixas,
      dataLoteProducaoIso: dataLoteProducaoIso || new Date().toISOString(),
    })),
  };
}
