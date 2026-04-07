import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type { Usuario } from '@/types/database';

function normalizarLogin(login: string): string {
  return login.trim().toLowerCase();
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { login?: string; senha?: string };
    const loginRaw = body.login;
    const senha = body.senha;
    if (!loginRaw?.trim() || senha === undefined || senha === '') {
      return NextResponse.json({ error: 'Informe usuário e senha' }, { status: 400 });
    }

    const loginN = normalizarLogin(loginRaw);
    let admin;
    try {
      admin = createSupabaseAdmin();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Configuração do servidor incompleta';
      return NextResponse.json(
        { error: `${msg}. Defina SUPABASE_SERVICE_ROLE_KEY no deploy (Railway) e no .env.local.` },
        { status: 503 }
      );
    }

    const { data: porLogin, error: errLogin } = await admin
      .from('usuarios')
      .select('*')
      .eq('login_operacional', loginN)
      .eq('status', 'ativo')
      .maybeSingle();

    if (errLogin) {
      console.error(errLogin);
      return NextResponse.json({ error: 'Falha ao validar login' }, { status: 500 });
    }

    if (!porLogin) {
      return NextResponse.json({ error: 'Usuário ou senha inválidos' }, { status: 401 });
    }

    const { data: cred, error: errCred } = await admin
      .from('credenciais_login_operacional')
      .select('senha_hash')
      .eq('usuario_id', porLogin.id)
      .maybeSingle();

    if (errCred) {
      console.error(errCred);
      return NextResponse.json({ error: 'Falha ao validar credencial' }, { status: 500 });
    }

    if (!cred?.senha_hash) {
      return NextResponse.json(
        {
          error:
            'Credencial não configurada. Um administrador deve definir usuário e senha em Cadastros → Usuários.',
        },
        { status: 401 }
      );
    }

    if (await bcrypt.compare(senha, cred.senha_hash)) {
      return NextResponse.json({ usuario: porLogin as Usuario });
    }
    return NextResponse.json({ error: 'Usuário ou senha inválidos' }, { status: 401 });
  } catch {
    return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  }
}
