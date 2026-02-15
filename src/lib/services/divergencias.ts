import { supabase } from '@/lib/supabase';
import { Divergencia, DivergenciaUpdate } from '@/types/database';
import { registrarAuditoria } from './auditoria';

export interface DivergenciaCompleta extends Divergencia {
  transferencia?: { id: string; origem?: { nome: string }; destino?: { nome: string } };
  item?: { id: string; token_qr: string; produto?: { nome: string } };
  resolvedor?: { id: string; nome: string } | null;
}

export async function getDivergencias(apenasAbertas = true): Promise<DivergenciaCompleta[]> {
  let query = supabase
    .from('divergencias')
    .select(`
      *,
      transferencia:transferencias(id, origem:locais!origem_id(nome), destino:locais!destino_id(nome)),
      item:itens(id, token_qr, produto:produtos(nome)),
      resolvedor:usuarios!resolvido_por(id, nome)
    `)
    .order('created_at', { ascending: false });

  if (apenasAbertas) query = query.eq('resolvido', false);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function resolverDivergencia(id: string, usuarioId: string): Promise<void> {
  await supabase
    .from('divergencias')
    .update({ resolvido: true, resolvido_por: usuarioId })
    .eq('id', id);

  await registrarAuditoria({
    usuario_id: usuarioId,
    acao: 'RESOLVER_DIVERGENCIA',
    detalhes: { divergencia_id: id },
  });
}
