import type { Usuario } from '@/types/database';

/**
 * Login operacional: valida no servidor via Supabase (`usuarios.login_operacional` + bcrypt em `credenciais_login_operacional`).
 * Exige `SUPABASE_SERVICE_ROLE_KEY` no ambiente (Railway / `.env.local`).
 */
export async function autenticarOperacional(login: string, senha: string): Promise<Usuario> {
  const res = await fetch('/api/auth/operacional', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login, senha }),
  });

  const data = (await res.json().catch(() => ({}))) as { error?: string; usuario?: Usuario };

  if (!res.ok) {
    throw new Error(data.error || 'Usuário ou senha inválidos');
  }
  if (!data.usuario) {
    throw new Error('Resposta inválida do servidor');
  }
  return data.usuario;
}
