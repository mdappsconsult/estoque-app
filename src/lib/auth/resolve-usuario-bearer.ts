import { createClient } from '@supabase/supabase-js';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type { Usuario } from '@/types/database';

/** Perfis que podem usar extração de nota / compra por foto (alinhado à API). */
export const PERFIS_NOTA_COMPRA_API = new Set([
  'ADMIN_MASTER',
  'MANAGER',
  'OPERATOR_WAREHOUSE',
  'OPERATOR_WAREHOUSE_DRIVER',
]);

/**
 * Resolve o usuário do app a partir do header `Authorization: Bearer <access_token>` (sessão Supabase).
 * Usado em Route Handlers para não exigir senha operacional quando o cliente já está logado.
 */
export async function resolverUsuarioPorBearer(
  authorizationHeader: string | null
): Promise<{ ok: true; usuario: Usuario } | { ok: false; status: number; error: string }> {
  const raw = authorizationHeader?.trim() ?? '';
  const token = raw.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return { ok: false, status: 401, error: 'Faça login novamente para ler a nota.' };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return { ok: false, status: 503, error: 'Configuração do servidor incompleta.' };
  }

  const supa = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: errAuth } = await supa.auth.getUser(token);
  if (errAuth || !userData.user?.id) {
    return { ok: false, status: 401, error: 'Sessão inválida ou expirada. Faça login novamente.' };
  }

  let admin;
  try {
    admin = createSupabaseAdmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Configuração do servidor incompleta';
    return { ok: false, status: 503, error: `${msg}` };
  }

  const { data: row, error: errRow } = await admin
    .from('usuarios')
    .select('*')
    .eq('id', userData.user.id)
    .eq('status', 'ativo')
    .maybeSingle();

  if (errRow) {
    console.error(errRow);
    return { ok: false, status: 500, error: 'Falha ao carregar usuário.' };
  }
  if (!row) {
    return { ok: false, status: 403, error: 'Usuário não encontrado ou inativo.' };
  }
  if (!PERFIS_NOTA_COMPRA_API.has(row.perfil)) {
    return { ok: false, status: 403, error: 'Sem permissão para ler nota de compra.' };
  }

  return { ok: true, usuario: row as Usuario };
}
