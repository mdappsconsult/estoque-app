import { supabase } from '@/lib/supabase';
import { Item, ItemInsert, ItemUpdate } from '@/types/database';
import { registrarAuditoria } from './auditoria';

export interface ItemCompleto extends Item {
  produto?: { id: string; nome: string; medida: string | null; unidade_medida: string };
  local_atual?: { id: string; nome: string; tipo: string } | null;
  lote_compra?: { id: string; fornecedor: string | null; lote_fornecedor: string | null } | null;
}

// Gerar token QR único
export function gerarTokenQR(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const timestamp = Date.now().toString(36).toUpperCase();
  let random = '';
  for (let i = 0; i < 6; i++) {
    random += chars[Math.floor(Math.random() * chars.length)];
  }
  return `QR-${timestamp}-${random}`;
}

// Gerar token short (para exibir na etiqueta)
export function gerarTokenShort(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export async function getItens(filtros?: {
  local_id?: string;
  estado?: Item['estado'];
  produto_id?: string;
}): Promise<ItemCompleto[]> {
  let query = supabase
    .from('itens')
    .select('*, produto:produtos(id, nome, medida, unidade_medida), local_atual:locais!local_atual_id(id, nome, tipo), lote_compra:lotes_compra(id, fornecedor, lote_fornecedor)')
    .order('created_at', { ascending: false });

  if (filtros?.local_id) query = query.eq('local_atual_id', filtros.local_id);
  if (filtros?.estado) query = query.eq('estado', filtros.estado);
  if (filtros?.produto_id) query = query.eq('produto_id', filtros.produto_id);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

const ITEM_SELECT_COMPLETO =
  '*, produto:produtos(id, nome, medida, unidade_medida), local_atual:locais!local_atual_id(id, nome, tipo), lote_compra:lotes_compra(id, fornecedor, lote_fornecedor)';

/** Extrai token útil quando o QR veio como URL ou texto bruto. */
export function normalizarCodigoQrScaneado(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  try {
    if (s.startsWith('http://') || s.startsWith('https://')) {
      const u = new URL(s);
      const q =
        u.searchParams.get('q') ||
        u.searchParams.get('token') ||
        u.searchParams.get('token_qr') ||
        u.searchParams.get('id');
      if (q?.trim()) return q.trim();
      const parts = u.pathname.split('/').filter(Boolean);
      const last = parts[parts.length - 1];
      if (last) return decodeURIComponent(last);
    }
  } catch {
    // não é URL válida
  }
  return s;
}

export async function getItemByTokenQR(tokenQR: string): Promise<ItemCompleto | null> {
  const { data, error } = await supabase
    .from('itens')
    .select(ITEM_SELECT_COMPLETO)
    .eq('token_qr', tokenQR)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/** Resolve item pelo conteúdo do QR (token completo) ou pelo token curto da etiqueta. */
export async function getItemPorCodigoEscaneado(raw: string): Promise<ItemCompleto | null> {
  const token = normalizarCodigoQrScaneado(raw);
  if (!token) return null;

  const porQr = await getItemByTokenQR(token);
  if (porQr) return porQr;

  const short = token.replace(/\s/g, '').toUpperCase();
  if (short.length < 4 || short.length > 16) return null;

  const { data, error } = await supabase
    .from('itens')
    .select(ITEM_SELECT_COMPLETO)
    .eq('token_short', short)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function createItem(item: ItemInsert): Promise<Item> {
  const { data, error } = await supabase
    .from('itens')
    .insert(item)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createItens(itens: ItemInsert[]): Promise<Item[]> {
  const { data, error } = await supabase
    .from('itens')
    .insert(itens)
    .select();
  if (error) throw error;
  return data || [];
}

export async function updateItem(id: string, update: ItemUpdate): Promise<Item> {
  const { data, error } = await supabase
    .from('itens')
    .update(update)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Baixar item (consumo diário)
export async function baixarItem(itemId: string, localId: string, usuarioId: string): Promise<void> {
  // Verificar se item está EM_ESTOQUE no local correto
  const { data: item, error: fetchError } = await supabase
    .from('itens')
    .select('*')
    .eq('id', itemId)
    .single();
  
  if (fetchError) throw fetchError;
  if (!item) throw new Error('Item não encontrado');
  if (item.estado !== 'EM_ESTOQUE') throw new Error('Item não está em estoque');
  if (item.local_atual_id !== localId) throw new Error('Item não está neste local');

  // Atualizar estado
  await supabase.from('itens').update({ estado: 'BAIXADO' }).eq('id', itemId);

  // Registrar baixa
  await supabase.from('baixas').insert({ item_id: itemId, local_id: localId, usuario_id: usuarioId });

  // Auditoria
  await registrarAuditoria({
    usuario_id: usuarioId,
    local_id: localId,
    acao: 'BAIXA',
    item_id: itemId,
  });
}

// Descartar item (perda)
export async function descartarItem(itemId: string, motivo: string, localId: string, usuarioId: string): Promise<void> {
  const { data: item } = await supabase.from('itens').select('*').eq('id', itemId).single();
  if (!item) throw new Error('Item não encontrado');
  if (item.estado !== 'EM_ESTOQUE') throw new Error('Item não está em estoque');
  if (item.local_atual_id !== localId) throw new Error('Item não está neste local');

  await supabase.from('itens').update({ estado: 'DESCARTADO' }).eq('id', itemId);
  await supabase.from('perdas').insert({ item_id: itemId, motivo, local_id: localId, usuario_id: usuarioId });

  await registrarAuditoria({
    usuario_id: usuarioId,
    local_id: localId,
    acao: 'DESCARTE',
    item_id: itemId,
    detalhes: { motivo },
  });
}
