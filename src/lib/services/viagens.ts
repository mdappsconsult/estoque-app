import { supabase } from '@/lib/supabase';
import { Viagem, ViagemInsert } from '@/types/database';
import { registrarAuditoria } from './auditoria';

export interface ViagemCompleta extends Viagem {
  motorista?: { id: string; nome: string } | null;
  transferencias?: { id: string; status: string; destino?: { id: string; nome: string } }[];
}

export async function getViagens(status?: Viagem['status']): Promise<ViagemCompleta[]> {
  let query = supabase
    .from('viagens')
    .select('*, motorista:usuarios!motorista_id(id, nome)')
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw error;

  // Buscar transferências de cada viagem
  const viagens = await Promise.all(
    (data || []).map(async (v) => {
      const { data: trans } = await supabase
        .from('transferencias')
        .select('id, status, destino:locais!destino_id(id, nome)')
        .eq('viagem_id', v.id);
      return { ...v, transferencias: trans || [] };
    })
  );

  return viagens;
}

export async function criarViagem(viagem: ViagemInsert): Promise<Viagem> {
  const { data, error } = await supabase
    .from('viagens')
    .insert(viagem)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Itens → EM_TRANSFERENCIA e remessa → IN_TRANSIT (uso interno).
 * `aceitoPor` preenche `aceito_por` quando a remessa vinha de AWAITING_ACCEPT.
 */
async function colocarRemessaEItensEmTransito(
  transferId: string,
  aceitoPor?: string | null
): Promise<void> {
  const { data: transItens, error: eTi } = await supabase
    .from('transferencia_itens')
    .select('item_id')
    .eq('transferencia_id', transferId);
  if (eTi) throw eTi;

  const itemIds = (transItens || []).map((ti) => ti.item_id);
  if (itemIds.length > 0) {
    const { error: eIt } = await supabase
      .from('itens')
      .update({ estado: 'EM_TRANSFERENCIA' })
      .in('id', itemIds);
    if (eIt) throw eIt;
  }

  const patch: { status: string; aceito_por?: string } = { status: 'IN_TRANSIT' };
  if (aceitoPor) patch.aceito_por = aceitoPor;
  const { error: eTr } = await supabase.from('transferencias').update(patch).eq('id', transferId);
  if (eTr) throw eTr;
}

/**
 * Aceitar viagem **e** despachar na hora: viagem e remessas passam a IN_TRANSIT
 * (a loja vê no Recebimento sem segundo passo «Iniciar viagem»).
 */
export async function aceitarViagem(id: string, motoristaId: string): Promise<void> {
  const { data: viagem, error: viagemError } = await supabase
    .from('viagens')
    .select('id, status')
    .eq('id', id)
    .single();
  if (viagemError) throw viagemError;
  if (!viagem) throw new Error('Viagem não encontrada');
  if (viagem.status !== 'PENDING') {
    throw new Error('Somente viagens pendentes podem ser aceitas');
  }

  const { data: transPend, error: eList } = await supabase
    .from('transferencias')
    .select('id, status')
    .eq('viagem_id', id)
    .in('status', ['AWAITING_ACCEPT', 'ACCEPTED']);
  if (eList) throw eList;
  if (!transPend?.length) {
    throw new Error('Nenhuma remessa aguardando despacho nesta viagem');
  }

  const { error: upV } = await supabase
    .from('viagens')
    .update({ status: 'IN_TRANSIT', motorista_id: motoristaId })
    .eq('id', id);
  if (upV) throw upV;

  await Promise.all(
    transPend.map((t) => {
      const row = t as { id: string; status: string };
      const definirAceitoPor = row.status === 'AWAITING_ACCEPT' ? motoristaId : null;
      return colocarRemessaEItensEmTransito(row.id, definirAceitoPor);
    })
  );

  await registrarAuditoria({
    usuario_id: motoristaId,
    acao: 'ACEITAR_VIAGEM',
    detalhes: { viagem_id: id, despacho_imediato: true },
  });
}

export async function iniciarViagem(id: string, motoristaId: string): Promise<void> {
  const { data: viagem, error: viagemError } = await supabase
    .from('viagens')
    .select('id, status, motorista_id')
    .eq('id', id)
    .single();
  if (viagemError) throw viagemError;
  if (!viagem) throw new Error('Viagem não encontrada');
  if (viagem.status !== 'ACCEPTED') {
    throw new Error('Somente viagens aceitas podem ser iniciadas');
  }
  if (viagem.motorista_id !== motoristaId) {
    throw new Error('Somente o motorista que aceitou pode iniciar a viagem');
  }

  // Despachar todas as transferências aceitas da viagem.
  const { data: transferencias } = await supabase
    .from('transferencias')
    .select('id')
    .eq('viagem_id', id)
    .eq('status', 'ACCEPTED');

  if (!transferencias || transferencias.length === 0) {
    throw new Error('Nenhuma transferência aceita para iniciar esta viagem');
  }

  const { error: upViag } = await supabase
    .from('viagens')
    .update({ status: 'IN_TRANSIT' })
    .eq('id', id);
  if (upViag) throw upViag;

  await Promise.all(
    transferencias.map((t) => colocarRemessaEItensEmTransito(t.id as string, null))
  );

  await registrarAuditoria({
    usuario_id: motoristaId,
    acao: 'INICIAR_VIAGEM',
    detalhes: { viagem_id: id },
  });
}

export async function completarViagem(id: string): Promise<void> {
  await supabase.from('viagens').update({ status: 'COMPLETED' }).eq('id', id);
}
