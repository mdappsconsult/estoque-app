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

async function sincronizarEstoquePorProdutos(produtoIds: string[]): Promise<void> {
  const idsUnicos = Array.from(new Set(produtoIds.filter(Boolean)));
  if (idsUnicos.length === 0) return;

  await Promise.all(
    idsUnicos.map(async (produtoId) => {
      const { count, error: countError } = await supabase
        .from('itens')
        .select('id', { count: 'exact', head: true })
        .eq('produto_id', produtoId)
        .eq('estado', 'EM_ESTOQUE');
      if (countError) throw countError;

      const { error: upsertError } = await supabase
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
  type ItemLinha = { id: string; local_atual_id: string | null; estado: string };
  const itensValidos: ItemLinha[] = [];
  for (let i = 0; i < idsOrd.length; i += IN_CLAUSE_CHUNK) {
    const slice = idsOrd.slice(i, i + IN_CLAUSE_CHUNK);
    const { data: chunk, error: itensError } = await client
      .from('itens')
      .select('id, local_atual_id, estado')
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

  return data;
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

    const inconsistente = (itensAtuais || []).find(
      (item) => item.estado !== 'EM_ESTOQUE' || item.local_atual_id !== transferencia.origem_id
    );
    if (inconsistente) {
      throw new Error('Há itens fora do local/estado esperado para despacho');
    }

    await supabase
      .from('itens')
      .update({ estado: 'EM_TRANSFERENCIA' })
      .in('id', itemIds);

    await sincronizarEstoquePorProdutos((itensAtuais || []).map((item) => item.produto_id));
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

  if (divergencias.length > 0 && !options?.encerrarComDivergencia) {
    throw new Error(
      'A conferência não está completa. Escanear todos os itens da lista antes de «Confirmar recebimento», ou use «Encerrar com divergência» se faltar produto na entrega.'
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
 * Só permitido com todas as unidades ainda **EM_ESTOQUE** na origem.
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
    .select('id, estado, local_atual_id')
    .in('id', itemIds);
  if (e3) throw e3;
  const invalido = (itensRows || []).find(
    (row) => row.estado !== 'EM_ESTOQUE' || row.local_atual_id !== tr.origem_id
  );
  if (invalido) {
    throw new Error(
      'Não é possível cancelar: há unidade já despachada, recebida ou fora da indústria de origem.'
    );
  }

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
