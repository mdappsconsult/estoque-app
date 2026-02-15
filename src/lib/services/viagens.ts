import { supabase } from '@/lib/supabase';
import { Viagem, ViagemInsert, ViagemUpdate } from '@/types/database';
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

export async function aceitarViagem(id: string, motoristaId: string): Promise<void> {
  await supabase
    .from('viagens')
    .update({ status: 'ACCEPTED', motorista_id: motoristaId })
    .eq('id', id);

  await registrarAuditoria({
    usuario_id: motoristaId,
    acao: 'ACEITAR_VIAGEM',
    detalhes: { viagem_id: id },
  });
}

export async function iniciarViagem(id: string, motoristaId: string): Promise<void> {
  await supabase.from('viagens').update({ status: 'IN_TRANSIT' }).eq('id', id);

  // Despachar todas as transferências da viagem
  const { data: transferencias } = await supabase
    .from('transferencias')
    .select('id')
    .eq('viagem_id', id)
    .eq('status', 'ACCEPTED');

  for (const t of transferencias || []) {
    const { data: transItens } = await supabase
      .from('transferencia_itens')
      .select('item_id')
      .eq('transferencia_id', t.id);

    const itemIds = (transItens || []).map(ti => ti.item_id);
    if (itemIds.length > 0) {
      await supabase.from('itens').update({ estado: 'EM_TRANSFERENCIA' }).in('id', itemIds);
    }
    await supabase.from('transferencias').update({ status: 'IN_TRANSIT' }).eq('id', t.id);
  }

  await registrarAuditoria({
    usuario_id: motoristaId,
    acao: 'INICIAR_VIAGEM',
    detalhes: { viagem_id: id },
  });
}

export async function completarViagem(id: string): Promise<void> {
  await supabase.from('viagens').update({ status: 'COMPLETED' }).eq('id', id);
}
