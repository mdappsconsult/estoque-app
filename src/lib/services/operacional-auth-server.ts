import bcrypt from 'bcryptjs';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type { Usuario } from '@/types/database';

function normalizarLogin(login: string): string {
  return login.trim().toLowerCase();
}

/**
 * Valida login operacional + senha no servidor (mesma regra de `POST /api/auth/operacional`).
 * Retorna o usuário ou `null` se inválido.
 */
export async function validarCredencialOperacional(
  loginRaw: string,
  senha: string
): Promise<{ ok: true; usuario: Usuario } | { ok: false; status: number; error: string }> {
  if (!loginRaw?.trim() || senha === undefined || senha === '') {
    return { ok: false, status: 400, error: 'Informe usuário e senha' };
  }

  let admin;
  try {
    admin = createSupabaseAdmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Configuração do servidor incompleta';
    return {
      ok: false,
      status: 503,
      error: `${msg}. Defina SUPABASE_SERVICE_ROLE_KEY no deploy e no .env.local.`,
    };
  }

  const loginN = normalizarLogin(loginRaw);

  const { data: porLogin, error: errLogin } = await admin
    .from('usuarios')
    .select('*')
    .eq('login_operacional', loginN)
    .eq('status', 'ativo')
    .maybeSingle();

  if (errLogin) {
    console.error(errLogin);
    return { ok: false, status: 500, error: 'Falha ao validar login' };
  }

  if (!porLogin) {
    return { ok: false, status: 401, error: 'Usuário ou senha inválidos' };
  }

  const { data: cred, error: errCred } = await admin
    .from('credenciais_login_operacional')
    .select('senha_hash')
    .eq('usuario_id', porLogin.id)
    .maybeSingle();

  if (errCred) {
    console.error(errCred);
    return { ok: false, status: 500, error: 'Falha ao validar credencial' };
  }

  if (!cred?.senha_hash) {
    return {
      ok: false,
      status: 401,
      error:
        'Credencial não configurada. Um administrador deve definir usuário e senha em Cadastros → Usuários.',
    };
  }

  if (await bcrypt.compare(senha, cred.senha_hash)) {
    return { ok: true, usuario: porLogin as Usuario };
  }
  return { ok: false, status: 401, error: 'Usuário ou senha inválidos' };
}
