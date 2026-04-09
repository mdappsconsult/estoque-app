import { supabase } from '@/lib/supabase';
import { Item, ItemInsert, ItemUpdate } from '@/types/database';
import { registrarAuditoria } from './auditoria';
import { recalcularEstoqueProduto } from './estoque-sync';

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

/** Contagem de unidades EM_ESTOQUE no local (para conferência antes de produção / separação). */
export async function contarItensDisponiveisLocal(
  produtoId: string,
  localId: string
): Promise<number> {
  const { count, error } = await supabase
    .from('itens')
    .select('id', { count: 'exact', head: true })
    .eq('produto_id', produtoId)
    .eq('local_atual_id', localId)
    .eq('estado', 'EM_ESTOQUE');
  if (error) throw error;
  return count ?? 0;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Quantas linhas existem em `itens` (EM_ESTOQUE) por produto no local.
 * O RPC `resumo_estoque_agrupado` também soma saldo em lote sem QR; na separação manual só dá para enviar unidades já mintadas.
 */
export async function contarItensComQrPorProdutosNoLocal(
  produtoIds: string[],
  localId: string
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const unique = [...new Set(produtoIds.filter(Boolean))];
  for (const id of unique) map.set(id, 0);
  if (!localId || unique.length === 0) return map;

  const PAGE = 1000;
  for (const part of chunkArray(unique, 120)) {
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase
        .from('itens')
        .select('produto_id')
        .eq('estado', 'EM_ESTOQUE')
        .eq('local_atual_id', localId)
        .in('produto_id', part)
        .order('id', { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error) throw error;
      const rows = data || [];
      if (rows.length === 0) break;
      for (const row of rows) {
        const pid = row.produto_id as string;
        map.set(pid, (map.get(pid) || 0) + 1);
      }
      if (rows.length < PAGE) break;
      offset += PAGE;
    }
  }
  return map;
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

  await recalcularEstoqueProduto(item.produto_id);

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
  await recalcularEstoqueProduto(item.produto_id);
  await supabase.from('perdas').insert({ item_id: itemId, motivo, local_id: localId, usuario_id: usuarioId });

  await registrarAuditoria({
    usuario_id: usuarioId,
    local_id: localId,
    acao: 'DESCARTE',
    item_id: itemId,
    detalhes: { motivo },
  });
}
