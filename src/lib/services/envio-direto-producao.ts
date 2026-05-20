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
 * - `produtos.origem = 'PRODUCAO'` (caixas e baldes feitos na fábrica)
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
  if (prod.origem !== 'PRODUCAO') {
    throw new Error(
      'Envio direto só vale para baldes/caixas de produção (origem PRODUCAO). Use «Separar por Loja» para compra/insumos.'
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
 * Filtra produtos com `origem = 'PRODUCAO'`. Mostra também quanto há disponível na indústria de origem.
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
    .eq('origem', 'PRODUCAO');
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
