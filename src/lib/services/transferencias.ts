import { supabase } from '@/lib/supabase';
import { Transferencia, TransferenciaInsert, TransferenciaUpdate } from '@/types/database';
import { registrarAuditoria } from './auditoria';

export interface TransferenciaCompleta extends Transferencia {
  origem?: { id: string; nome: string; tipo: string };
  destino?: { id: string; nome: string; tipo: string };
  criador?: { id: string; nome: string };
  aceitador?: { id: string; nome: string } | null;
  itens?: { id: string; item_id: string; recebido: boolean; item?: { id: string; token_qr: string; produto?: { nome: string } } }[];
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

export async function criarTransferencia(
  transferencia: TransferenciaInsert,
  itemIds: string[]
): Promise<Transferencia> {
  const { data, error } = await supabase
    .from('transferencias')
    .insert(transferencia)
    .select()
    .single();
  if (error) throw error;

  // Vincular itens
  if (itemIds.length > 0) {
    const transItens = itemIds.map(itemId => ({
      transferencia_id: data.id,
      item_id: itemId,
    }));
    await supabase.from('transferencia_itens').insert(transItens);
  }

  await registrarAuditoria({
    usuario_id: transferencia.criado_por,
    local_id: transferencia.origem_id,
    acao: 'CRIAR_TRANSFERENCIA',
    origem_id: transferencia.origem_id,
    destino_id: transferencia.destino_id,
    detalhes: { transferencia_id: data.id, qtd_itens: itemIds.length },
  });

  return data;
}

export async function aceitarTransferencia(id: string, usuarioId: string): Promise<void> {
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
  // Buscar itens da transferência
  const { data: transItens } = await supabase
    .from('transferencia_itens')
    .select('item_id')
    .eq('transferencia_id', id);

  // Marcar itens como EM_TRANSFERENCIA
  const itemIds = (transItens || []).map(ti => ti.item_id);
  if (itemIds.length > 0) {
    await supabase
      .from('itens')
      .update({ estado: 'EM_TRANSFERENCIA' })
      .in('id', itemIds);
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

// Receber transferência - escanear QRs recebidos
export async function receberTransferencia(
  transferenciaId: string,
  itensRecebidosIds: string[],
  localDestinoId: string,
  usuarioId: string
): Promise<{ divergencias: { tipo: 'FALTANTE' | 'EXCEDENTE'; item_id: string }[] }> {
  // Buscar itens esperados
  const { data: transItens } = await supabase
    .from('transferencia_itens')
    .select('item_id')
    .eq('transferencia_id', transferenciaId);

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

  // Marcar itens recebidos
  for (const itemId of itensRecebidosIds) {
    await supabase
      .from('transferencia_itens')
      .update({ recebido: true })
      .eq('transferencia_id', transferenciaId)
      .eq('item_id', itemId);

    // Mover item para o destino
    if (esperados.has(itemId)) {
      await supabase
        .from('itens')
        .update({ local_atual_id: localDestinoId, estado: 'EM_ESTOQUE' })
        .eq('id', itemId);
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
