import { supabase } from '@/lib/supabase';
import { registrarAuditoria } from './auditoria';
import { recalcularEstoqueProduto } from './estoque-sync';
import { normalizarCodigoQrScaneado } from './itens';
import type { Transferencia } from '@/types/database';

/**
 * Envio direto da produção: a indústria abre uma remessa **sem QRs** para uma loja, informando
 * só **produto (balde de produção)** e **quantidade**. A loja escaneia cada balde físico que chega
 * e o sistema, **a cada bip**, move o item da indústria para a loja e adiciona em
 * `transferencia_itens(recebido = true)`. Fecha como `DELIVERED` ao atingir a quantidade.
 *
 * Restrições do produto:
 * - `produtos.status = 'ativo'`
 * - `produtos.origem IN ('PRODUCAO','AMBOS')` — aceita produtos «feitos na fábrica» mesmo quando o
 *   cadastro permite também entrada por compra (ex.: «Açaí Balde 11L» tem `origem='AMBOS'`).
 */

export interface CriarEnvioDiretoInput {
  origemId: string;
  destinoId: string;
  produtoId: string;
  quantidade: number;
  criadoPor: string;
}

export interface BipQrEnvioDiretoInput {
  transferenciaId: string;
  /** Token completo / curto / URL do QR — passa pelo `normalizarCodigoQrScaneado`. */
  codigoQr: string;
  usuarioId: string;
  /** Loja destino (deve bater com `transferencias.destino_id`). */
  localDestinoId: string;
}

export interface BipQrEnvioDiretoResultado {
  itemId: string;
  produtoId: string;
  bipados: number;
  total: number;
  fechouRemessa: boolean;
  avisoFefo?: string | null;
}

export interface EnvioDiretoResumo {
  id: string;
  origemId: string;
  destinoId: string;
  produtoId: string;
  produtoNome: string;
  quantidadeDemandada: number;
  bipados: number;
  status: Transferencia['status'];
  criadoEm: string;
  origemNome: string;
  destinoNome: string;
}

/** Cria remessa modo_bip_loja com produto + qty, sem itens. */
export async function criarEnvioDiretoProducao(
  input: CriarEnvioDiretoInput
): Promise<{ transferenciaId: string }> {
  const origem = input.origemId.trim();
  const destino = input.destinoId.trim();
  const produto = input.produtoId.trim();
  const qty = Math.floor(Number(input.quantidade));
  const criador = input.criadoPor.trim();
  if (!origem || !destino || !produto || !criador) {
    throw new Error('Origem, destino, produto e usuário são obrigatórios.');
  }
  if (origem === destino) {
    throw new Error('Origem e destino devem ser diferentes.');
  }
  if (!Number.isFinite(qty) || qty < 1) {
    throw new Error('Quantidade precisa ser inteiro ≥ 1.');
  }

  const { data: prod, error: ePr } = await supabase
    .from('produtos')
    .select('id, nome, status, origem')
    .eq('id', produto)
    .single();
  if (ePr) throw ePr;
  if (!prod) throw new Error('Produto não encontrado.');
  if (prod.status !== 'ativo') {
    throw new Error('Produto inativo — habilite no cadastro antes de enviar.');
  }
  if (prod.origem !== 'PRODUCAO' && prod.origem !== 'AMBOS') {
    throw new Error(
      'Envio direto só vale para produtos feitos na fábrica (origem PRODUCAO ou AMBOS). Use «Separar por Loja» para itens de compra/insumo.'
    );
  }

  const { data: locOrigem, error: eLo } = await supabase
    .from('locais')
    .select('id, tipo')
    .eq('id', origem)
    .single();
  if (eLo) throw eLo;
  if (locOrigem?.tipo !== 'WAREHOUSE') {
    throw new Error('Origem precisa ser uma indústria/armazém (WAREHOUSE).');
  }

  const { data: locDestino, error: eLd } = await supabase
    .from('locais')
    .select('id, tipo')
    .eq('id', destino)
    .single();
  if (eLd) throw eLd;
  if (locDestino?.tipo !== 'STORE') {
    throw new Error('Destino precisa ser uma loja (STORE).');
  }

  const { data: tr, error: eTr } = await supabase
    .from('transferencias')
    .insert({
      tipo: 'WAREHOUSE_STORE',
      origem_id: origem,
      destino_id: destino,
      criado_por: criador,
      status: 'AWAITING_ACCEPT',
      modo_bip_loja: true,
      produto_demandado_id: produto,
      quantidade_demandada: qty,
    })
    .select('id')
    .single();
  if (eTr) throw eTr;
  if (!tr) throw new Error('Falha ao criar a remessa.');

  await registrarAuditoria({
    usuario_id: criador,
    local_id: origem,
    acao: 'CRIAR_ENVIO_DIRETO_PRODUCAO',
    origem_id: origem,
    destino_id: destino,
    detalhes: { transferencia_id: tr.id, produto_id: produto, quantidade: qty },
  });

  return { transferenciaId: tr.id };
}

/** Bipa 1 QR da loja: valida produto + origem, move item para a loja, fecha quando completa. */
export async function bipQrEnvioDireto(
  input: BipQrEnvioDiretoInput
): Promise<BipQrEnvioDiretoResultado> {
  const tid = input.transferenciaId.trim();
  const token = normalizarCodigoQrScaneado(input.codigoQr || '');
  const usuarioId = input.usuarioId.trim();
  const destinoId = input.localDestinoId.trim();
  if (!tid || !token || !usuarioId || !destinoId) {
    throw new Error('Remessa, QR, usuário e loja destino são obrigatórios.');
  }

  const { data: tr, error: eTr } = await supabase
    .from('transferencias')
    .select(
      'id, tipo, status, origem_id, destino_id, modo_bip_loja, produto_demandado_id, quantidade_demandada'
    )
    .eq('id', tid)
    .single();
  if (eTr) throw eTr;
  if (!tr) throw new Error('Remessa não encontrada.');
  if (!tr.modo_bip_loja) {
    throw new Error('Esta remessa não é envio direto; use o fluxo normal de recebimento.');
  }
  if (tr.destino_id !== destinoId) {
    throw new Error('Loja destino do bip não corresponde à remessa.');
  }
  if (tr.status === 'DELIVERED' || tr.status === 'DIVERGENCE') {
    throw new Error('Esta remessa já foi encerrada.');
  }

  const produtoEsperado = tr.produto_demandado_id;
  const qtyEsperada = Number(tr.quantidade_demandada);
  if (!produtoEsperado || !Number.isFinite(qtyEsperada)) {
    throw new Error('Remessa sem produto/quantidade definidos.');
  }

  const { data: itemPorQr, error: eItQr } = await supabase
    .from('itens')
    .select('id, token_qr, token_short, produto_id, estado, local_atual_id, created_at')
    .eq('token_qr', token)
    .maybeSingle();
  let item = itemPorQr;
  if (eItQr && eItQr.code !== 'PGRST116') throw eItQr;
  if (!item) {
    const short = token.replace(/\s/g, '').toUpperCase();
    if (short.length >= 4 && short.length <= 16) {
      const { data: porShort, error: eShort } = await supabase
        .from('itens')
        .select('id, token_qr, token_short, produto_id, estado, local_atual_id, created_at')
        .eq('token_short', short)
        .maybeSingle();
      if (eShort && eShort.code !== 'PGRST116') throw eShort;
      item = porShort;
    }
  }
  if (!item) throw new Error('QR não encontrado no sistema. Confira a etiqueta.');

  if (item.produto_id !== produtoEsperado) {
    throw new Error(
      'Este QR é de outro produto. A remessa só aceita o produto definido pela indústria.'
    );
  }

  const { data: jaBipado, error: eJa } = await supabase
    .from('transferencia_itens')
    .select('id')
    .eq('transferencia_id', tid)
    .eq('item_id', item.id)
    .maybeSingle();
  if (eJa && eJa.code !== 'PGRST116') throw eJa;
  if (jaBipado) throw new Error('Este QR já foi bipado nesta remessa.');

  if (item.estado === 'EM_ESTOQUE') {
    if (item.local_atual_id !== tr.origem_id) {
      throw new Error(
        'Este balde não está no estoque da indústria de origem; confira se já foi enviado a outra loja.'
      );
    }
  } else if (item.estado === 'EM_TRANSFERENCIA') {
    const { data: outras, error: eO } = await supabase
      .from('transferencia_itens')
      .select('id, transferencia_id, transferencia:transferencias(status)')
      .eq('item_id', item.id);
    if (eO) throw eO;
    type Linha = { id: string; transferencia_id: string; transferencia: { status?: string } | { status?: string }[] | null };
    const linhas = (outras || []) as Linha[];
    const conflito = linhas.find((l) => {
      const trj = Array.isArray(l.transferencia) ? l.transferencia[0] : l.transferencia;
      const st = trj?.status;
      return l.transferencia_id !== tid && (st === 'AWAITING_ACCEPT' || st === 'ACCEPTED' || st === 'IN_TRANSIT');
    });
    if (conflito) {
      throw new Error('Este QR já está em outra remessa em aberto. Encerre a anterior antes.');
    }
  } else {
    throw new Error(`Estado inválido do item: ${item.estado}. Não pode ser bipado.`);
  }

  const { error: eIns } = await supabase
    .from('transferencia_itens')
    .insert({ transferencia_id: tid, item_id: item.id, recebido: true });
  if (eIns) throw eIns;

  const { error: eUpItem } = await supabase
    .from('itens')
    .update({ local_atual_id: destinoId, estado: 'EM_ESTOQUE' })
    .eq('id', item.id);
  if (eUpItem) throw eUpItem;

  const { count: bipados, error: eCt } = await supabase
    .from('transferencia_itens')
    .select('id', { count: 'exact', head: true })
    .eq('transferencia_id', tid);
  if (eCt) throw eCt;
  const total = Number(qtyEsperada);
  const atual = bipados ?? 0;

  let fechouRemessa = false;
  if (atual >= total) {
    const { error: eUpTr } = await supabase
      .from('transferencias')
      .update({ status: 'DELIVERED' })
      .eq('id', tid);
    if (eUpTr) throw eUpTr;
    fechouRemessa = true;
  } else if (tr.status === 'AWAITING_ACCEPT') {
    const { error: eUpTr } = await supabase
      .from('transferencias')
      .update({ status: 'IN_TRANSIT' })
      .eq('id', tid);
    if (eUpTr) throw eUpTr;
  }

  await recalcularEstoqueProduto(produtoEsperado);

  let avisoFefo: string | null = null;
  if (item.created_at) {
    const { data: maisAntigo, error: eFifo } = await supabase
      .from('itens')
      .select('id, token_short, created_at')
      .eq('produto_id', produtoEsperado)
      .eq('local_atual_id', tr.origem_id)
      .eq('estado', 'EM_ESTOQUE')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!eFifo && maisAntigo && maisAntigo.id !== item.id) {
      const created = new Date(item.created_at).getTime();
      const antigo = new Date(maisAntigo.created_at as string).getTime();
      if (Number.isFinite(created) && Number.isFinite(antigo) && antigo < created) {
        avisoFefo = `Há balde mais antigo na indústria (token ${maisAntigo.token_short || '—'}). Recomendado enviar o mais antigo primeiro (FEFO).`;
      }
    }
  }

  await registrarAuditoria({
    usuario_id: usuarioId,
    local_id: destinoId,
    item_id: item.id,
    acao: 'BIP_ENVIO_DIRETO_PRODUCAO',
    origem_id: tr.origem_id,
    destino_id: destinoId,
    detalhes: { transferencia_id: tid, bipados: atual, total, fechou: fechouRemessa },
  });

  return {
    itemId: item.id,
    produtoId: produtoEsperado,
    bipados: atual,
    total,
    fechouRemessa,
    avisoFefo,
  };
}

export interface BipAvulsoInput {
  codigoQr: string;
  localDestinoId: string;
  usuarioId: string;
}

export interface BipAvulsoResultado {
  itemId: string;
  produtoId: string;
  produtoNome: string;
  origemId: string;
  origemNome: string;
  destinoNome: string;
  transferenciaId: string;
  avisoFefo?: string | null;
}

/**
 * **Bip avulso** (sem remessa prévia). O operador da loja escaneia um QR de balde físico que
 * a indústria entregou. O sistema:
 * - valida que o balde é de produção (`origem PRODUCAO|AMBOS`) e está **EM_ESTOQUE em uma indústria**;
 * - cria uma `transferencias` indústria → loja **modo_bip_loja=TRUE**, `quantidade_demandada=1`,
 *   status `DELIVERED`, com o `transferencia_itens(recebido=true)`;
 * - move o item para a loja (`local_atual_id=loja`, `estado=EM_ESTOQUE`);
 * - registra auditoria `BIP_AVULSO_PRODUCAO` (o operador da indústria vê em
 *   `/envio-direto-producao` → «Saídas recentes»).
 *
 * Cada bip = 1 remessa fechada (rastreio forte e simples). A indústria não precisa abrir nada
 * antes; ela só leva o balde para a loja e o funcionário da loja bipa na chegada.
 */
export async function bipQrAvulsoProducao(input: BipAvulsoInput): Promise<BipAvulsoResultado> {
  const token = normalizarCodigoQrScaneado(input.codigoQr || '');
  const destinoId = input.localDestinoId.trim();
  const usuarioId = input.usuarioId.trim();
  if (!token || !destinoId || !usuarioId) {
    throw new Error('QR, loja destino e usuário são obrigatórios.');
  }

  const { data: locDestino, error: eLd } = await supabase
    .from('locais')
    .select('id, nome, tipo')
    .eq('id', destinoId)
    .single();
  if (eLd) throw eLd;
  if (locDestino?.tipo !== 'STORE') {
    throw new Error('Destino do bip avulso precisa ser uma loja (STORE).');
  }

  const { data: itemPorQr, error: eItQr } = await supabase
    .from('itens')
    .select('id, token_qr, token_short, produto_id, estado, local_atual_id, created_at')
    .eq('token_qr', token)
    .maybeSingle();
  let item = itemPorQr;
  if (eItQr && eItQr.code !== 'PGRST116') throw eItQr;
  if (!item) {
    const short = token.replace(/\s/g, '').toUpperCase();
    if (short.length >= 4 && short.length <= 16) {
      const { data: porShort, error: eShort } = await supabase
        .from('itens')
        .select('id, token_qr, token_short, produto_id, estado, local_atual_id, created_at')
        .eq('token_short', short)
        .maybeSingle();
      if (eShort && eShort.code !== 'PGRST116') throw eShort;
      item = porShort;
    }
  }
  if (!item) throw new Error('QR não encontrado no sistema. Confira a etiqueta.');

  if (item.estado !== 'EM_ESTOQUE') {
    throw new Error(
      `Este balde está como «${item.estado}» — não dá para receber pelo bip avulso. Confira se já foi recebido em outra loja ou baixado.`
    );
  }
  if (!item.local_atual_id) {
    throw new Error('Balde sem local de origem. Fale com a gerência.');
  }
  if (item.local_atual_id === destinoId) {
    throw new Error('Este balde já está nesta loja.');
  }

  const { data: origem, error: eOrig } = await supabase
    .from('locais')
    .select('id, nome, tipo')
    .eq('id', item.local_atual_id)
    .single();
  if (eOrig) throw eOrig;
  if (origem?.tipo !== 'WAREHOUSE') {
    throw new Error(
      'Este balde não está em uma indústria/armazém — bip avulso aceita só baldes vindos da indústria.'
    );
  }

  const { data: produto, error: eProd } = await supabase
    .from('produtos')
    .select('id, nome, origem, status')
    .eq('id', item.produto_id)
    .single();
  if (eProd) throw eProd;
  if (!produto) throw new Error('Produto do balde não encontrado.');
  if (produto.status !== 'ativo') {
    throw new Error('Produto está inativo. Habilite no cadastro antes de receber.');
  }
  if (produto.origem !== 'PRODUCAO' && produto.origem !== 'AMBOS') {
    throw new Error(
      'Bip avulso aceita só baldes/caixas feitos na fábrica (origem PRODUCAO ou AMBOS). Para insumos de compra, use «Separar por Loja».'
    );
  }

  const { data: outras, error: eO } = await supabase
    .from('transferencia_itens')
    .select('id, transferencia_id, transferencia:transferencias(status)')
    .eq('item_id', item.id);
  if (eO) throw eO;
  type Linha = { id: string; transferencia_id: string; transferencia: { status?: string } | { status?: string }[] | null };
  const conflito = (outras || []).find((raw) => {
    const l = raw as unknown as Linha;
    const trj = Array.isArray(l.transferencia) ? l.transferencia[0] : l.transferencia;
    const st = trj?.status;
    return st === 'AWAITING_ACCEPT' || st === 'ACCEPTED' || st === 'IN_TRANSIT';
  });
  if (conflito) {
    throw new Error(
      'Este balde já está em uma remessa aberta. Receba/encerre a remessa antes ou peça à indústria para cancelar.'
    );
  }

  const { data: tr, error: eTr } = await supabase
    .from('transferencias')
    .insert({
      tipo: 'WAREHOUSE_STORE',
      origem_id: origem.id,
      destino_id: destinoId,
      criado_por: usuarioId,
      status: 'DELIVERED',
      modo_bip_loja: true,
      produto_demandado_id: produto.id,
      quantidade_demandada: 1,
    })
    .select('id')
    .single();
  if (eTr) throw eTr;
  if (!tr) throw new Error('Falha ao registrar o recebimento avulso.');

  const { error: eIns } = await supabase
    .from('transferencia_itens')
    .insert({ transferencia_id: tr.id, item_id: item.id, recebido: true });
  if (eIns) {
    await supabase.from('transferencias').delete().eq('id', tr.id);
    throw eIns;
  }

  const { error: eUpItem } = await supabase
    .from('itens')
    .update({ local_atual_id: destinoId, estado: 'EM_ESTOQUE' })
    .eq('id', item.id);
  if (eUpItem) throw eUpItem;

  await recalcularEstoqueProduto(produto.id);

  let avisoFefo: string | null = null;
  if (item.created_at) {
    const { data: maisAntigo, error: eFifo } = await supabase
      .from('itens')
      .select('id, token_short, created_at')
      .eq('produto_id', produto.id)
      .eq('local_atual_id', origem.id)
      .eq('estado', 'EM_ESTOQUE')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!eFifo && maisAntigo && maisAntigo.id !== item.id) {
      const created = new Date(item.created_at).getTime();
      const antigo = new Date(maisAntigo.created_at as string).getTime();
      if (Number.isFinite(created) && Number.isFinite(antigo) && antigo < created) {
        avisoFefo = `Há balde mais antigo na indústria (token ${maisAntigo.token_short || '—'}). Próxima entrega use o mais antigo (FEFO).`;
      }
    }
  }

  await registrarAuditoria({
    usuario_id: usuarioId,
    local_id: destinoId,
    item_id: item.id,
    acao: 'BIP_AVULSO_PRODUCAO',
    origem_id: origem.id,
    destino_id: destinoId,
    detalhes: { transferencia_id: tr.id, produto_id: produto.id },
  });

  return {
    itemId: item.id,
    produtoId: produto.id,
    produtoNome: produto.nome as string,
    origemId: origem.id,
    origemNome: origem.nome as string,
    destinoNome: locDestino.nome as string,
    transferenciaId: tr.id,
    avisoFefo,
  };
}

/** Encerra remessa modo_bip_loja com sobra/falta (gera divergência FALTANTE se faltou). */
export async function encerrarEnvioDiretoComDivergencia(
  transferenciaId: string,
  usuarioId: string
): Promise<{ faltantes: number }> {
  const tid = transferenciaId.trim();
  if (!tid || !usuarioId.trim()) throw new Error('Remessa e usuário são obrigatórios.');

  const { data: tr, error: eTr } = await supabase
    .from('transferencias')
    .select('id, status, modo_bip_loja, quantidade_demandada, produto_demandado_id, destino_id, origem_id')
    .eq('id', tid)
    .single();
  if (eTr) throw eTr;
  if (!tr?.modo_bip_loja) throw new Error('Esta remessa não é envio direto.');
  if (tr.status === 'DELIVERED' || tr.status === 'DIVERGENCE') {
    throw new Error('Remessa já encerrada.');
  }

  const { count: bipados, error: eCt } = await supabase
    .from('transferencia_itens')
    .select('id', { count: 'exact', head: true })
    .eq('transferencia_id', tid);
  if (eCt) throw eCt;
  const total = Number(tr.quantidade_demandada);
  const atual = bipados ?? 0;
  const faltantes = Math.max(0, total - atual);

  const { error: eUp } = await supabase
    .from('transferencias')
    .update({ status: faltantes > 0 ? 'DIVERGENCE' : 'DELIVERED' })
    .eq('id', tid);
  if (eUp) throw eUp;

  await registrarAuditoria({
    usuario_id: usuarioId,
    local_id: tr.destino_id,
    acao: faltantes > 0 ? 'ENCERRAR_ENVIO_DIRETO_DIVERGENCIA' : 'ENCERRAR_ENVIO_DIRETO_OK',
    origem_id: tr.origem_id,
    destino_id: tr.destino_id,
    detalhes: { transferencia_id: tid, bipados: atual, total, faltantes },
  });

  return { faltantes };
}

/** Cancela uma remessa modo_bip_loja sem nenhum QR ainda bipado (indústria desistiu antes da loja). */
export async function cancelarEnvioDiretoSemBips(
  transferenciaId: string,
  usuarioId: string
): Promise<void> {
  const tid = transferenciaId.trim();
  if (!tid || !usuarioId.trim()) throw new Error('Remessa e usuário são obrigatórios.');

  const { data: tr, error: eTr } = await supabase
    .from('transferencias')
    .select('id, status, modo_bip_loja, origem_id, destino_id')
    .eq('id', tid)
    .single();
  if (eTr) throw eTr;
  if (!tr?.modo_bip_loja) throw new Error('Esta remessa não é envio direto.');
  if (tr.status === 'DELIVERED' || tr.status === 'DIVERGENCE') {
    throw new Error('Remessa já encerrada.');
  }

  const { count, error: eCt } = await supabase
    .from('transferencia_itens')
    .select('id', { count: 'exact', head: true })
    .eq('transferencia_id', tid);
  if (eCt) throw eCt;
  if ((count ?? 0) > 0) {
    throw new Error('Já há baldes bipados; encerre com divergência em vez de cancelar.');
  }

  const { error: eDel } = await supabase.from('transferencias').delete().eq('id', tid);
  if (eDel) throw eDel;

  await registrarAuditoria({
    usuario_id: usuarioId,
    local_id: tr.origem_id,
    acao: 'CANCELAR_ENVIO_DIRETO_PRODUCAO',
    origem_id: tr.origem_id,
    destino_id: tr.destino_id,
    detalhes: { transferencia_id: tid },
  });
}

export interface DemandaPorLojaRow {
  lojaId: string;
  lojaNome: string;
  produtoId: string;
  produtoNome: string;
  estoqueMinimo: number;
  estoqueAtualLoja: number;
  faltante: number;
  estoqueIndustria: number;
}

/**
 * Demanda por loja: `loja_produtos_config.estoque_minimo_loja` (ativo) − estoque atual (QR EM_ESTOQUE na loja).
 * Filtra produtos com `origem IN ('PRODUCAO','AMBOS')` — inclui itens cujo cadastro também permite compra
 * (ex.: «Açaí Balde 11L»). Mostra também quanto há disponível na indústria de origem.
 */
export async function listarDemandaBaldesProducaoPorLoja(
  origemIndustriaId: string
): Promise<DemandaPorLojaRow[]> {
  const origem = origemIndustriaId.trim();
  if (!origem) return [];

  const { data: produtos, error: eP } = await supabase
    .from('produtos')
    .select('id, nome')
    .eq('status', 'ativo')
    .in('origem', ['PRODUCAO', 'AMBOS']);
  if (eP) throw eP;
  const pMap = new Map<string, string>();
  for (const p of produtos || []) pMap.set(p.id as string, p.nome as string);
  if (pMap.size === 0) return [];
  const produtoIds = [...pMap.keys()];

  const { data: configs, error: eC } = await supabase
    .from('loja_produtos_config')
    .select(
      'loja_id, produto_id, estoque_minimo_loja, ativo_na_loja, loja:locais!loja_id(id, nome, tipo)'
    )
    .eq('ativo_na_loja', true)
    .in('produto_id', produtoIds);
  if (eC) throw eC;

  type ConfigRow = {
    loja_id: string;
    produto_id: string;
    estoque_minimo_loja: number;
    loja: { id?: string; nome?: string; tipo?: string } | { id?: string; nome?: string; tipo?: string }[] | null;
  };
  const lojasUnicas = new Set<string>();
  const linhas: { lojaId: string; lojaNome: string; produtoId: string; produtoNome: string; estoqueMinimo: number }[] = [];
  for (const raw of (configs || []) as ConfigRow[]) {
    const loja = Array.isArray(raw.loja) ? raw.loja[0] : raw.loja;
    if (!loja?.id || loja.tipo !== 'STORE') continue;
    const minimo = Math.max(0, Math.floor(Number(raw.estoque_minimo_loja || 0)));
    if (minimo <= 0) continue;
    lojasUnicas.add(loja.id);
    linhas.push({
      lojaId: loja.id,
      lojaNome: loja.nome || 'Loja',
      produtoId: raw.produto_id,
      produtoNome: pMap.get(raw.produto_id) || 'Produto',
      estoqueMinimo: minimo,
    });
  }
  if (linhas.length === 0) return [];

  const lojasArr = [...lojasUnicas];
  const estoqueLoja = new Map<string, number>();
  const PAGE = 1000;
  for (let i = 0; i < lojasArr.length; i += 50) {
    const sliceLojas = lojasArr.slice(i, i + 50);
    for (let j = 0; j < produtoIds.length; j += 100) {
      const sliceProdutos = produtoIds.slice(j, j + 100);
      let from = 0;
      for (;;) {
        const { data, error } = await supabase
          .from('itens')
          .select('produto_id, local_atual_id')
          .eq('estado', 'EM_ESTOQUE')
          .in('local_atual_id', sliceLojas)
          .in('produto_id', sliceProdutos)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const rows = data || [];
        for (const r of rows) {
          const k = `${r.local_atual_id}|${r.produto_id}`;
          estoqueLoja.set(k, (estoqueLoja.get(k) || 0) + 1);
        }
        if (rows.length < PAGE) break;
        from += PAGE;
      }
    }
  }

  const estoqueIndustria = new Map<string, number>();
  for (let j = 0; j < produtoIds.length; j += 100) {
    const sliceProdutos = produtoIds.slice(j, j + 100);
    let from = 0;
    for (;;) {
      const { data, error } = await supabase
        .from('itens')
        .select('produto_id')
        .eq('estado', 'EM_ESTOQUE')
        .eq('local_atual_id', origem)
        .in('produto_id', sliceProdutos)
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const rows = data || [];
      for (const r of rows) {
        estoqueIndustria.set(r.produto_id as string, (estoqueIndustria.get(r.produto_id as string) || 0) + 1);
      }
      if (rows.length < PAGE) break;
      from += PAGE;
    }
  }

  const linhasComSaldo: DemandaPorLojaRow[] = linhas
    .map((l) => {
      const atual = estoqueLoja.get(`${l.lojaId}|${l.produtoId}`) || 0;
      const faltante = Math.max(0, l.estoqueMinimo - atual);
      return {
        ...l,
        estoqueAtualLoja: atual,
        faltante,
        estoqueIndustria: estoqueIndustria.get(l.produtoId) || 0,
      };
    })
    .filter((l) => l.faltante > 0)
    .sort((a, b) => {
      if (a.lojaNome !== b.lojaNome) return a.lojaNome.localeCompare(b.lojaNome, 'pt-BR');
      return a.produtoNome.localeCompare(b.produtoNome, 'pt-BR');
    });

  return linhasComSaldo;
}

/** Lista as remessas modo_bip_loja em andamento (para o painel da indústria acompanhar). */
export async function listarEnviosDiretosEmAndamento(
  origemId?: string
): Promise<EnvioDiretoResumo[]> {
  let query = supabase
    .from('transferencias')
    .select(
      `id, origem_id, destino_id, status, created_at, produto_demandado_id, quantidade_demandada,
       origem:locais!origem_id(nome), destino:locais!destino_id(nome),
       produto:produtos!produto_demandado_id(nome)`
    )
    .eq('modo_bip_loja', true)
    .in('status', ['AWAITING_ACCEPT', 'ACCEPTED', 'IN_TRANSIT'])
    .order('created_at', { ascending: false });
  if (origemId) query = query.eq('origem_id', origemId);
  const { data, error } = await query;
  if (error) throw error;

  type Row = {
    id: string;
    origem_id: string;
    destino_id: string;
    status: Transferencia['status'];
    created_at: string;
    produto_demandado_id: string;
    quantidade_demandada: number;
    origem: { nome?: string } | { nome?: string }[] | null;
    destino: { nome?: string } | { nome?: string }[] | null;
    produto: { nome?: string } | { nome?: string }[] | null;
  };
  const rows = (data || []) as Row[];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const { data: contagens, error: eC } = await supabase
    .from('transferencia_itens')
    .select('transferencia_id')
    .in('transferencia_id', ids);
  if (eC) throw eC;
  const bipPorRemessa = new Map<string, number>();
  for (const row of contagens || []) {
    const k = row.transferencia_id as string;
    bipPorRemessa.set(k, (bipPorRemessa.get(k) || 0) + 1);
  }

  const norm = <T extends { nome?: string }>(v: T | T[] | null): T | null =>
    !v ? null : Array.isArray(v) ? (v[0] ?? null) : v;

  return rows.map((r) => ({
    id: r.id,
    origemId: r.origem_id,
    destinoId: r.destino_id,
    produtoId: r.produto_demandado_id,
    produtoNome: norm(r.produto)?.nome || 'Produto',
    quantidadeDemandada: r.quantidade_demandada,
    bipados: bipPorRemessa.get(r.id) || 0,
    status: r.status,
    criadoEm: r.created_at,
    origemNome: norm(r.origem)?.nome || 'Origem',
    destinoNome: norm(r.destino)?.nome || 'Destino',
  }));
}

export interface SaidaAvulsaAgrupada {
  origemId: string;
  destinoId: string;
  destinoNome: string;
  produtoId: string;
  produtoNome: string;
  quantidade: number;
  primeiraEm: string;
  ultimaEm: string;
}

/**
 * Saídas avulsas (`bipQrAvulsoProducao`) das últimas 24h, agrupadas por loja+produto.
 * Indústria vê na hora o que a loja recebeu sem planejamento prévio.
 */
export async function listarSaidasAvulsasRecentes(
  origemId: string,
  janelaHoras = 24
): Promise<SaidaAvulsaAgrupada[]> {
  const origem = origemId.trim();
  if (!origem) return [];
  const desde = new Date(Date.now() - janelaHoras * 3600 * 1000).toISOString();

  const { data, error } = await supabase
    .from('transferencias')
    .select(
      `id, origem_id, destino_id, status, created_at, produto_demandado_id, quantidade_demandada,
       destino:locais!destino_id(nome),
       produto:produtos!produto_demandado_id(nome)`
    )
    .eq('modo_bip_loja', true)
    .eq('status', 'DELIVERED')
    .eq('origem_id', origem)
    .eq('quantidade_demandada', 1)
    .gte('created_at', desde)
    .order('created_at', { ascending: false });
  if (error) throw error;

  type Row = {
    id: string;
    origem_id: string;
    destino_id: string;
    created_at: string;
    produto_demandado_id: string;
    quantidade_demandada: number;
    destino: { nome?: string } | { nome?: string }[] | null;
    produto: { nome?: string } | { nome?: string }[] | null;
  };
  const norm = <T extends { nome?: string }>(v: T | T[] | null): T | null =>
    !v ? null : Array.isArray(v) ? (v[0] ?? null) : v;

  const grupos = new Map<string, SaidaAvulsaAgrupada>();
  for (const raw of (data || []) as Row[]) {
    const key = `${raw.destino_id}|${raw.produto_demandado_id}`;
    const atual = grupos.get(key);
    const destinoNome = norm(raw.destino)?.nome || 'Loja';
    const produtoNome = norm(raw.produto)?.nome || 'Produto';
    if (!atual) {
      grupos.set(key, {
        origemId: raw.origem_id,
        destinoId: raw.destino_id,
        destinoNome,
        produtoId: raw.produto_demandado_id,
        produtoNome,
        quantidade: 1,
        primeiraEm: raw.created_at,
        ultimaEm: raw.created_at,
      });
    } else {
      atual.quantidade += 1;
      if (raw.created_at < atual.primeiraEm) atual.primeiraEm = raw.created_at;
      if (raw.created_at > atual.ultimaEm) atual.ultimaEm = raw.created_at;
    }
  }
  return [...grupos.values()].sort((a, b) => (a.ultimaEm < b.ultimaEm ? 1 : -1));
}
