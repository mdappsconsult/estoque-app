import { supabase } from '@/lib/supabase';
import { Auditoria, AuditoriaInsert } from '@/types/database';

export interface AuditoriaCompleta extends Auditoria {
  usuario?: { id: string; nome: string } | null;
  local?: { id: string; nome: string } | null;
  item?: { id: string; token_qr: string; produto?: { nome: string } } | null;
}

export async function registrarAuditoria(registro: AuditoriaInsert): Promise<void> {
  const { error } = await supabase.from('auditoria').insert(registro);
  if (error) console.error('Erro ao registrar auditoria:', error);
}

export async function getAuditoria(filtros?: {
  usuario_id?: string;
  local_id?: string;
  item_id?: string;
  acao?: string;
  limit?: number;
}): Promise<AuditoriaCompleta[]> {
  let query = supabase
    .from('auditoria')
    .select(`
      *,
      usuario:usuarios(id, nome),
      local:locais!local_id(id, nome),
      item:itens(id, token_qr, produto:produtos(nome))
    `)
    .order('created_at', { ascending: false })
    .limit(filtros?.limit || 100);

  if (filtros?.usuario_id) query = query.eq('usuario_id', filtros.usuario_id);
  if (filtros?.local_id) query = query.eq('local_id', filtros.local_id);
  if (filtros?.item_id) query = query.eq('item_id', filtros.item_id);
  if (filtros?.acao) query = query.eq('acao', filtros.acao);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// Rastreio completo de um item
export async function getRastreioItem(itemId: string): Promise<AuditoriaCompleta[]> {
  return getAuditoria({ item_id: itemId, limit: 500 });
}
