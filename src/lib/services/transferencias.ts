import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Transferencia, TransferenciaInsert } from '@/types/database';
import { registrarAuditoria } from './auditoria';

export interface TransferenciaCompleta extends Transferencia {
  origem?: { id: string; nome: string; tipo: string };
  destino?: { id: string; nome: string; tipo: string };
  criador?: { id: string; nome: string };
  aceitador?: { id: string; nome: string } | null;
  itens?: { id: string; item_id: string; recebido: boolean; item?: { id: string; token_qr: string; produto?: { nome: string } } }[];
}

type TransferenciaComItensMinimo = Pick<Transferencia, 'id' | 'origem_id' | 'destino_id' | 'status'> & {
  transferencia_itens: { item_id: string }[];
};

async function sincronizarEstoquePorProdutos(
  produtoIds: string[],
  db: SupabaseClient = supabase
): Promise<void> {
  const idsUnicos = Array.from(new Set(produtoIds.filter(Boolean)));
  if (idsUnicos.length === 0) return;

  await Promise.all(
    idsUnicos.map(async (produtoId) => {
      const { count, error: countError } = await db
        .from('itens')
        .select('id', { count: 'exact', head: true })
        .eq('produto_id', produtoId)
        .eq('estado', 'EM_ESTOQUE');
      if (countError) throw countError;

      const { error: upsertError } = await db
        .from('estoque')
        .upsert(
          {
            produto_id: produtoId,
            quantidade: count ?? 0,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'produto_id' }
        );
      if (upsertError) throw upsertError;
    })
  );
}

async function getTransferenciaComItensMinimo(id: string): Promise<TransferenciaComItensMinimo> {
  const { data, error } = await supabase
    .from('transferencias')
    .select('id, origem_id, destino_id, status, transferencia_itens(item_id)')
    .eq('id', id)
    .single();

  if (error) throw error;
  if (!data) throw new Error('Transferência não encontrada');

  return data as TransferenciaComItensMinimo;
}

export async function getTransferencias(filtros?: {
  status?: Transferencia['status'];
  origem_id?: string;
  destino_id?: string;
  viagem_id?: string;
}): Promise<TransferenciaCompleta[]> {
  let query = supabase
    .from('transferencias')
    .select(`
      *,
      origem:locais!origem_id(id, nome, tipo),
      destino:locais!destino_id(id, nome, tipo),
      criador:usuarios!criado_por(id, nome),
      aceitador:usuarios!aceito_por(id, nome)
    `)
    .order('created_at', { ascending: false });

  if (filtros?.status) query = query.eq('status', filtros.status);
  if (filtros?.origem_id) query = query.eq('origem_id', filtros.origem_id);
  if (filtros?.destino_id) query = query.eq('destino_id', filtros.destino_id);
  if (filtros?.viagem_id) query = query.eq('viagem_id', filtros.viagem_id);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getTransferenciaById(id: string): Promise<TransferenciaCompleta | null> {
  const { data, error } = await supabase
    .from('transferencias')
    .select(`
      *,
      origem:locais!origem_id(id, nome, tipo),
      destino:locais!destino_id(id, nome, tipo),
      criador:usuarios!criado_por(id, nome),
      aceitador:usuarios!aceito_por(id, nome)
    `)
    .eq('id', id)
    .single();
  if (error) throw error;

  // Buscar itens da transferência
  const { data: itens } = await supabase
    .from('transferencia_itens')
    .select('*, item:itens(id, token_qr, produto:produtos(nome))')
    .eq('transferencia_id', id);

  return { ...data, itens: itens || [] };
}

/** PostgREST empilha `in.(…)` na query-string; listas grandes estouram URL e travam o browser. */
const IN_CLAUSE_CHUNK = 100;
const INSERT_TRANSFERENCIA_ITENS_CHUNK = 200;

/** Remessas em que o vínculo `transferencia_itens` ainda reserva a unidade (antes de concluir recebimento). */
const STATUS_REMESSA_RESERVA_ITEM: Transferencia['status'][] = ['AWAITING_ACCEPT', 'ACCEPTED', 'IN_TRANSIT'];

/**
 * Impede dupla reserva: o mesmo `item_id` pode aparecer em várias linhas de `transferencia_itens`
 * (índice único só por remessa), o que gerava etiqueta com um destino e `local_atual` coerente com outro recebimento.
 */
async function assertItensSemVinculoRemessaAberta(itemIds: string[], client: SupabaseClient): Promise<void> {
  if (itemIds.length === 0) return;
  const reservado = new Set<string>(STATUS_REMESSA_RESERVA_ITEM);
  for (let i = 0; i < itemIds.length; i += IN_CLAUSE_CHUNK) {
    const slice = itemIds.slice(i, i + IN_CLAUSE_CHUNK);
    const { data: links, error } = await client.from('transferencia_itens').select('item_id, transferencia_id').in('item_id', slice);
    if (error) throw error;
    if (!links?.length) continue;
    const tids = [...new Set(links.map((l) => l.transferencia_id).filter(Boolean))] as string[];
    if (tids.length === 0) continue;
    const { data: trs, error: trErr } = await client.from('transferencias').select('id, status').in('id', tids);
    if (trErr) throw trErr;
    const statusPorTid = new Map((trs || []).map((t) => [t.id as string, t.status as string]));
    const conflito = links.find((l) => reservado.has(statusPorTid.get(l.transferencia_id as string) || ''));
    if (conflito) {
      throw new Error(
        'Um ou mais itens já estão em outra remessa em aberto (aguardando aceite, aceita ou em trânsito). Não é possível reservar o mesmo QR em duas remessas ao mesmo tempo — encerre ou ajuste a remessa anterior, ou use outras unidades.'
      );
    }
  }
}

export async function criarTransferencia(
  transferencia: TransferenciaInsert,
  itemIds: string[],
  client: SupabaseClient = supabase
): Promise<Transferencia> {
  if (itemIds.length === 0) {
    throw new Error('A transferência precisa de pelo menos 1 item');
  }

  const idsOrd = [...new Set(itemIds.map((id) => String(id || '').trim()).filter(Boolean))];
  if (idsOrd.length !== itemIds.length) {
    throw new Error('A lista contém o mesmo item mais de uma vez. Cada unidade (QR) deve aparecer só uma vez.');
  }

  // Blindagem no service: itens precisam estar EM_ESTOQUE e no local de origem (consulta em fatias).
  type ItemLinha = { id: string; local_atual_id: string | null; estado: string; produto_id: string };
  const itensValidos: ItemLinha[] = [];
  for (let i = 0; i < idsOrd.length; i += IN_CLAUSE_CHUNK) {
    const slice = idsOrd.slice(i, i + IN_CLAUSE_CHUNK);
    const { data: chunk, error: itensError } = await client
      .from('itens')
      .select('id, local_atual_id, estado, produto_id')
      .in('id', slice);
    if (itensError) throw itensError;
    itensValidos.push(...((chunk || []) as ItemLinha[]));
  }

  if (itensValidos.length !== idsOrd.length) {
    throw new Error('Um ou mais itens não foram encontrados');
  }

  const itemInvalido = itensValidos.find(
    (item) => item.estado !== 'EM_ESTOQUE' || item.local_atual_id !== transferencia.origem_id
  );
  if (itemInvalido) {
    throw new Error('Todos os itens devem estar em estoque no local de origem');
  }

  await assertItensSemVinculoRemessaAberta(idsOrd, client);

  const { data, error } = await client.from('transferencias').insert(transferencia).select().single();
  if (error) throw error;

  // Vincular itens em lotes (corpo JSON; evita payload único gigante e falhas silenciosas).
  if (idsOrd.length > 0) {
    try {
      for (let i = 0; i < idsOrd.length; i += INSERT_TRANSFERENCIA_ITENS_CHUNK) {
        const slice = idsOrd.slice(i, i + INSERT_TRANSFERENCIA_ITENS_CHUNK);
        const transItens = slice.map((itemId) => ({
          transferencia_id: data.id,
          item_id: itemId,
        }));
        const { error: insErr } = await client.from('transferencia_itens').insert(transItens);
        if (insErr) throw insErr;
      }
    } catch (e) {
      await client.from('transferencias').delete().eq('id', data.id);
      throw e;
    }
  }

  await registrarAuditoria(
    {
      usuario_id: transferencia.criado_por,
      local_id: transferencia.origem_id,
      acao: 'CRIAR_TRANSFERENCIA',
      origem_id: transferencia.origem_id,
      destino_id: transferencia.destino_id,
      detalhes: { transferencia_id: data.id, qtd_itens: idsOrd.length },
    },
    client
  );

  // Matriz → loja: reserva imediata na origem (saldo «Em estoque» na indústria/estoque cai ao criar a SEP).
  if (transferencia.tipo === 'WAREHOUSE_STORE' && idsOrd.length > 0) {
    for (let i = 0; i < idsOrd.length; i += IN_CLAUSE_CHUNK) {
      const slice = idsOrd.slice(i, i + IN_CLAUSE_CHUNK);
      const { error: eRes } = await client
        .from('itens')
        .update({ estado: 'EM_TRANSFERENCIA' })
        .in('id', slice);
      if (eRes) throw eRes;
    }
    await sincronizarEstoquePorProdutos(
      itensValidos.map((row) => row.produto_id),
      client
    );
  }

  return data;
}

const STATUS_SEP_PODE_ACRESCENTAR_ITENS = new Set<string>(['AWAITING_ACCEPT', 'ACCEPTED']);

/**
 * Acrescenta unidades a uma remessa matriz→loja **já criada** (mesma `transferencias.id`),
 * antes do despacho. Usado para dividir o POST em fatias (evita `fetch failed` em remessas grandes).
 */
export async function adicionarItensTransferenciaMatrizLoja(
  transferenciaId: string,
  itemIds: string[],
  usuarioId: string,
  client: SupabaseClient = supabase
): Promise<{ qtd_adicionados: number }> {
  if (itemIds.length === 0) {
    return { qtd_adicionados: 0 };
  }

  const { data: tr, error: e1 } = await client
    .from('transferencias')
    .select('id, tipo, status, origem_id, destino_id, viagem_id')
    .eq('id', transferenciaId)
    .single();
  if (e1) throw e1;
  if (!tr) throw new Error('Transferência não encontrada');
  if (tr.tipo !== 'WAREHOUSE_STORE') {
    throw new Error('Só é possível acrescentar itens em remessas indústria → loja');
  }
  if (!STATUS_SEP_PODE_ACRESCENTAR_ITENS.has(String(tr.status))) {
    throw new Error(
      'Só é possível acrescentar itens enquanto a remessa estiver aguardando aceite ou aceita (antes do trânsito).'
    );
  }

  const { data: existTi, error: eTi } = await client
    .from('transferencia_itens')
    .select('item_id')
    .eq('transferencia_id', transferenciaId);
  if (eTi) throw eTi;
  const jaNaRemessa = new Set((existTi || []).map((r) => String(r.item_id || '').trim()).filter(Boolean));

  const idsOrd = [...new Set(itemIds.map((id) => String(id || '').trim()).filter(Boolean))].filter(
    (id) => !jaNaRemessa.has(id)
  );
  if (idsOrd.length === 0) {
    return { qtd_adicionados: 0 };
  }

  type ItemLinha = { id: string; local_atual_id: string | null; estado: string; produto_id: string };
  const itensValidos: ItemLinha[] = [];
  for (let i = 0; i < idsOrd.length; i += IN_CLAUSE_CHUNK) {
    const slice = idsOrd.slice(i, i + IN_CLAUSE_CHUNK);
    const { data: chunk, error: itensError } = await client
      .from('itens')
      .select('id, local_atual_id, estado, produto_id')
      .in('id', slice);
    if (itensError) throw itensError;
    itensValidos.push(...((chunk || []) as ItemLinha[]));
  }

  if (itensValidos.length !== idsOrd.length) {
    throw new Error('Um ou mais itens não foram encontrados');
  }

  const origemId = String(tr.origem_id || '').trim();
  const itemInvalido = itensValidos.find(
    (item) => item.estado !== 'EM_ESTOQUE' || item.local_atual_id !== origemId
  );
  if (itemInvalido) {
    throw new Error('Todos os itens novos devem estar em estoque no local de origem da remessa');
  }

  await assertItensSemVinculoRemessaAberta(idsOrd, client);

  try {
    for (let i = 0; i < idsOrd.length; i += INSERT_TRANSFERENCIA_ITENS_CHUNK) {
      const slice = idsOrd.slice(i, i + INSERT_TRANSFERENCIA_ITENS_CHUNK);
      const transItens = slice.map((itemId) => ({
        transferencia_id: transferenciaId,
        item_id: itemId,
      }));
      const { error: insErr } = await client.from('transferencia_itens').insert(transItens);
      if (insErr) throw insErr;
    }
  } catch (e) {
    for (let i = 0; i < idsOrd.length; i += INSERT_TRANSFERENCIA_ITENS_CHUNK) {
      const slice = idsOrd.slice(i, i + INSERT_TRANSFERENCIA_ITENS_CHUNK);
      await client.from('transferencia_itens').delete().eq('transferencia_id', transferenciaId).in('item_id', slice);
    }
    throw e;
  }

  await registrarAuditoria(
    {
      usuario_id: usuarioId,
      local_id: origemId,
      acao: 'ADICIONAR_ITENS_SEPARACAO_MATRIZ_LOJA',
      origem_id: origemId,
      destino_id: tr.destino_id,
      detalhes: { transferencia_id: transferenciaId, qtd_itens: idsOrd.length },
    },
    client
  );

  for (let i = 0; i < idsOrd.length; i += IN_CLAUSE_CHUNK) {
    const slice = idsOrd.slice(i, i + IN_CLAUSE_CHUNK);
    const { error: eRes } = await client.from('itens').update({ estado: 'EM_TRANSFERENCIA' }).in('id', slice);
    if (eRes) throw eRes;
  }

  await sincronizarEstoquePorProdutos(
    itensValidos.map((row) => row.produto_id),
    client
  );

  return { qtd_adicionados: idsOrd.length };
}

export async function aceitarTransferencia(id: string, usuarioId: string): Promise<void> {
  const transferencia = await getTransferenciaComItensMinimo(id);
  if (transferencia.status !== 'AWAITING_ACCEPT') {
    throw new Error('Somente transferências aguardando aceite podem ser aceitas');
  }

  await supabase
    .from('transferencias')
    .update({ status: 'ACCEPTED', aceito_por: usuarioId })
    .eq('id', id);

  await registrarAuditoria({
    usuario_id: usuarioId,
    acao: 'ACEITAR_TRANSFERENCIA',
    detalhes: { transferencia_id: id },
  });
}

export async function despacharTransferencia(id: string, usuarioId: string): Promise<void> {
  const transferencia = await getTransferenciaComItensMinimo(id);
  if (transferencia.status !== 'ACCEPTED') {
    throw new Error('A transferência precisa estar aceita antes do despacho');
  }

  // Marcar itens como EM_TRANSFERENCIA
  const itemIds = (transferencia.transferencia_itens || []).map(ti => ti.item_id);
  if (itemIds.length > 0) {
    // Garantir que os itens ainda estão no estado correto antes de despachar.
    const { data: itensAtuais, error: itensError } = await supabase
      .from('itens')
      .select('id, produto_id, estado, local_atual_id')
      .in('id', itemIds);
    if (itensError) throw itensError;

    const okPreDespacho = (item: { estado: string; local_atual_id: string | null }) =>
      item.local_atual_id === transferencia.origem_id &&
      (item.estado === 'EM_ESTOQUE' || item.estado === 'EM_TRANSFERENCIA');

    const inconsistente = (itensAtuais || []).find((item) => !okPreDespacho(item));
    if (inconsistente) {
      throw new Error('Há itens fora do local/estado esperado para despacho');
    }

    await supabase
      .from('itens')
      .update({ estado: 'EM_TRANSFERENCIA' })
      .in('id', itemIds);

    await sincronizarEstoquePorProdutos((itensAtuais || []).map((item) => item.produto_id), supabase);
  }

  await supabase
    .from('transferencias')
    .update({ status: 'IN_TRANSIT' })
    .eq('id', id);

  await registrarAuditoria({
    usuario_id: usuarioId,
    acao: 'DESPACHAR_TRANSFERENCIA',
    detalhes: { transferencia_id: id, qtd_itens: itemIds.length },
  });
}

export type ReceberTransferenciaOptions = {
  /** Só quando faltar produto na entrega ou conferência incompleta de propósito; sem isso o servidor recusa divergência. */
  encerrarComDivergencia?: boolean;
};

// Receber transferência - escanear QRs recebidos
export async function receberTransferencia(
  transferenciaId: string,
  itensRecebidosIds: string[],
  localDestinoId: string,
  usuarioId: string,
  options?: ReceberTransferenciaOptions
): Promise<{ divergencias: { tipo: 'FALTANTE' | 'EXCEDENTE'; item_id: string }[] }> {
  const transferencia = await getTransferenciaComItensMinimo(transferenciaId);
  if (transferencia.status !== 'IN_TRANSIT') {
    throw new Error('Somente transferências em trânsito podem ser recebidas');
  }
  if (transferencia.destino_id !== localDestinoId) {
    throw new Error('Local de recebimento não corresponde ao destino da transferência');
  }

  const transItens = transferencia.transferencia_itens || [];
  const itemIdsEsperados = transItens.map((ti) => ti.item_id);

  const { data: itensEsperadosData, error: itensEsperadosError } = await supabase
    .from('itens')
    .select('id, produto_id')
    .in('id', itemIdsEsperados);
  if (itensEsperadosError) throw itensEsperadosError;
  const produtosEsperados = (itensEsperadosData || []).map((item) => item.produto_id);

  const esperados = new Set((transItens || []).map(ti => ti.item_id));
  const recebidos = new Set(itensRecebidosIds);

  const divergencias: { tipo: 'FALTANTE' | 'EXCEDENTE'; item_id: string }[] = [];

  // Faltantes: esperados mas não recebidos
  esperados.forEach(id => {
    if (!recebidos.has(id)) {
      divergencias.push({ tipo: 'FALTANTE', item_id: id });
    }
  });

  // Excedentes: recebidos mas não esperados
  recebidos.forEach(id => {
    if (!esperados.has(id)) {
      divergencias.push({ tipo: 'EXCEDENTE', item_id: id });
    }
  });

  if (divergencias.length > 0 && options?.encerrarComDivergencia) {
    const { data: opRow, error: opErr } = await supabase
      .from('usuarios')
      .select('perfil')
      .eq('id', usuarioId)
      .single();
    if (opErr) throw opErr;
    if (opRow?.perfil !== 'ADMIN_MASTER') {
      throw new Error(
        'Somente administrador do sistema pode encerrar o recebimento com divergência. Escaneie todos os itens ou peça a um administrador.'
      );
    }
  }

  if (divergencias.length > 0 && !options?.encerrarComDivergencia) {
    throw new Error(
      'A conferência não está completa. Escaneie todos os itens da lista antes de «Confirmar recebimento». Se faltar produto na entrega, peça ao administrador do sistema.'
    );
  }

  // Marcar recebidos e mover itens válidos — em lote (evita 2×N round-trips ao Supabase).
  if (itensRecebidosIds.length > 0) {
    const { error: errTi } = await supabase
      .from('transferencia_itens')
      .update({ recebido: true })
      .eq('transferencia_id', transferenciaId)
      .in('item_id', itensRecebidosIds);
    if (errTi) throw errTi;

    const idsParaMover = itensRecebidosIds.filter((id) => esperados.has(id));
    if (idsParaMover.length > 0) {
      const { error: errItens } = await supabase
        .from('itens')
        .update({ local_atual_id: localDestinoId, estado: 'EM_ESTOQUE' })
        .in('id', idsParaMover);
      if (errItens) throw errItens;
    }
  }

  // Registrar divergências
  if (divergencias.length > 0) {
    await supabase.from('divergencias').insert(
      divergencias.map(d => ({
        transferencia_id: transferenciaId,
        item_id: d.item_id,
        tipo: d.tipo,
      }))
    );
    await supabase.from('transferencias').update({ status: 'DIVERGENCE' }).eq('id', transferenciaId);
  } else {
    await supabase.from('transferencias').update({ status: 'DELIVERED' }).eq('id', transferenciaId);
  }

  await sincronizarEstoquePorProdutos(produtosEsperados);

  await registrarAuditoria({
    usuario_id: usuarioId,
    local_id: localDestinoId,
    acao: 'RECEBER_TRANSFERENCIA',
    detalhes: {
      transferencia_id: transferenciaId,
      recebidos: itensRecebidosIds.length,
      divergencias: divergencias.length,
    },
  });

  return { divergencias };
}

const STATUS_REMESSA_EDITAVEL = new Set(['AWAITING_ACCEPT', 'ACCEPTED']);

/**
 * Cancela uma separação matriz → loja ainda **não despachada**: remove transferência, vínculos,
 * marca etiquetas do lote `SEP-…` como excluídas e apaga a viagem se ficar órfã.
 * Unidades devem seguir na **origem**, em **EM_ESTOQUE** (legado) ou **EM_TRANSFERENCIA** (reserva na criação da SEP);
 * antes de apagar a remessa, devolve **EM_ESTOQUE** e recalcula agregado.
 */
export async function cancelarRemessaMatrizParaLoja(
  transferenciaId: string,
  usuarioId: string
): Promise<void> {
  const { data: tr, error: e1 } = await supabase
    .from('transferencias')
    .select('id, tipo, status, origem_id, destino_id, viagem_id')
    .eq('id', transferenciaId)
    .single();
  if (e1) throw e1;
  if (!tr) throw new Error('Transferência não encontrada');
  if (tr.tipo !== 'WAREHOUSE_STORE') {
    throw new Error('Somente remessas indústria → loja podem ser canceladas por este fluxo');
  }
  if (!STATUS_REMESSA_EDITAVEL.has(tr.status)) {
    throw new Error(
      'Só é possível cancelar remessas em «Aguardando aceite» ou «Aceita» (antes do despacho / trânsito).'
    );
  }

  const { data: titens, error: e2 } = await supabase
    .from('transferencia_itens')
    .select('item_id')
    .eq('transferencia_id', transferenciaId);
  if (e2) throw e2;
  const itemIds = (titens || []).map((r) => r.item_id as string).filter(Boolean);
  if (itemIds.length === 0) throw new Error('Remessa sem itens');

  const { data: itensRows, error: e3 } = await supabase
    .from('itens')
    .select('id, estado, local_atual_id, produto_id')
    .in('id', itemIds);
  if (e3) throw e3;
  const estadoCancelavel = (e: string) => e === 'EM_ESTOQUE' || e === 'EM_TRANSFERENCIA';
  const invalido = (itensRows || []).find(
    (row) => !estadoCancelavel(row.estado) || row.local_atual_id !== tr.origem_id
  );
  if (invalido) {
    throw new Error(
      'Não é possível cancelar: há unidade já despachada, recebida ou fora da indústria de origem.'
    );
  }

  const produtoIdsParaSync = Array.from(
    new Set((itensRows || []).map((r) => r.produto_id as string).filter(Boolean))
  );
  for (let i = 0; i < itemIds.length; i += IN_CLAUSE_CHUNK) {
    const slice = itemIds.slice(i, i + IN_CLAUSE_CHUNK);
    const { error: eRev } = await supabase
      .from('itens')
      .update({ estado: 'EM_ESTOQUE' })
      .in('id', slice)
      .eq('local_atual_id', tr.origem_id as string);
    if (eRev) throw eRev;
  }
  await sincronizarEstoquePorProdutos(produtoIdsParaSync, supabase);

  const viagemId = tr.viagem_id as string | null;
  let loteSep: string | null = null;
  if (viagemId) {
    loteSep = `SEP-${viagemId}`;
    const { count, error: cErr } = await supabase
      .from('transferencias')
      .select('id', { count: 'exact', head: true })
      .eq('viagem_id', viagemId);
    if (cErr) throw cErr;
    const apenasEsta = (count ?? 0) <= 1;

    const { error: eEt } = await supabase.from('etiquetas').update({ excluida: true }).eq('lote', loteSep);
    if (eEt) throw eEt;

    const { error: eDel } = await supabase.from('transferencias').delete().eq('id', transferenciaId);
    if (eDel) throw eDel;

    if (apenasEsta && viagemId) {
      const { error: eV } = await supabase.from('viagens').delete().eq('id', viagemId);
      if (eV) throw eV;
    }
  } else {
    const { error: eDel } = await supabase.from('transferencias').delete().eq('id', transferenciaId);
    if (eDel) throw eDel;
  }

  await registrarAuditoria({
    usuario_id: usuarioId,
    local_id: tr.origem_id as string,
    acao: 'CANCELAR_REMESSA_MATRIZ_LOJA',
    origem_id: tr.origem_id as string,
    destino_id: tr.destino_id as string,
    detalhes: {
      transferencia_id: transferenciaId,
      viagem_id: viagemId,
      lote_sep: loteSep,
      qtd_itens: itemIds.length,
    },
  });
}

/** Troca a loja de destino enquanto a remessa ainda não foi despachada. */
export async function alterarDestinoRemessaMatrizParaLoja(
  transferenciaId: string,
  novoDestinoId: string,
  usuarioId: string
): Promise<void> {
  const { data: tr, error: e1 } = await supabase
    .from('transferencias')
    .select('id, tipo, status, origem_id, destino_id')
    .eq('id', transferenciaId)
    .single();
  if (e1) throw e1;
  if (!tr) throw new Error('Transferência não encontrada');
  if (tr.tipo !== 'WAREHOUSE_STORE') {
    throw new Error('Somente remessas indústria → loja');
  }
  if (!STATUS_REMESSA_EDITAVEL.has(tr.status)) {
    throw new Error('Só é possível alterar o destino antes do despacho (trânsito).');
  }

  const destinoIdTrim = novoDestinoId.trim();
  if (!destinoIdTrim) throw new Error('Selecione a loja de destino');
  if (destinoIdTrim === tr.destino_id) return;

  const { data: loc, error: eL } = await supabase.from('locais').select('id, tipo').eq('id', destinoIdTrim).single();
  if (eL) throw eL;
  if (!loc || loc.tipo !== 'STORE') {
    throw new Error('O destino deve ser uma loja (STORE)');
  }

  const { error: eU } = await supabase
    .from('transferencias')
    .update({ destino_id: destinoIdTrim })
    .eq('id', transferenciaId);
  if (eU) throw eU;

  await registrarAuditoria({
    usuario_id: usuarioId,
    local_id: tr.origem_id as string,
    acao: 'ALTERAR_DESTINO_REMESSA_MATRIZ_LOJA',
    origem_id: tr.origem_id as string,
    destino_id: destinoIdTrim,
    detalhes: {
      transferencia_id: transferenciaId,
      destino_anterior_id: tr.destino_id,
      destino_novo_id: destinoIdTrim,
    },
  });
}
