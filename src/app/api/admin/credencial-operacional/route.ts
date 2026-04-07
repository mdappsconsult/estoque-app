import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

function normalizarLogin(login: string): string {
  return login.trim().toLowerCase();
}

const LOGIN_RE = /^[a-z0-9][a-z0-9._-]{1,39}$/;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      usuarioId?: string;
      loginOperacional?: string;
      senhaNova?: string;
      actorId?: string;
      removerCredencial?: boolean;
    };

    const { usuarioId, loginOperacional, senhaNova, actorId, removerCredencial } = body;

    if (!actorId?.trim() || !usuarioId?.trim()) {
      return NextResponse.json({ error: 'actorId e usuarioId são obrigatórios' }, { status: 400 });
    }

    let admin;
    try {
      admin = createSupabaseAdmin();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Servidor mal configurado';
      return NextResponse.json({ error: msg }, { status: 503 });
    }

    const { data: actor, error: actorErr } = await admin
      .from('usuarios')
      .select('perfil')
      .eq('id', actorId)
      .eq('status', 'ativo')
      .maybeSingle();

    if (actorErr || !actor || actor.perfil !== 'ADMIN_MASTER') {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }

    if (removerCredencial) {
      await admin.from('credenciais_login_operacional').delete().eq('usuario_id', usuarioId);
      await admin.from('usuarios').update({ login_operacional: null }).eq('id', usuarioId);
      return NextResponse.json({ ok: true });
    }

    const { data: urow } = await admin
      .from('usuarios')
      .select('login_operacional')
      .eq('id', usuarioId)
      .maybeSingle();

    const loginTrim = loginOperacional?.trim();
    const loginN = loginTrim
      ? normalizarLogin(loginTrim)
      : urow?.login_operacional
        ? normalizarLogin(urow.login_operacional)
        : '';

    if (!loginN) {
      return NextResponse.json(
        { error: 'Informe o usuário (login) para entrar no sistema' },
        { status: 400 }
      );
    }
    if (!LOGIN_RE.test(loginN)) {
      return NextResponse.json(
        {
          error:
            'Login inválido: use 2–40 caracteres, letras minúsculas, números, ponto, hífen ou sublinhado (comece com letra ou número).',
        },
        { status: 400 }
      );
    }

    const { data: outro } = await admin
      .from('usuarios')
      .select('id')
      .eq('login_operacional', loginN)
      .neq('id', usuarioId)
      .maybeSingle();

    if (outro) {
      return NextResponse.json({ error: 'Este login já está em uso por outro usuário' }, { status: 409 });
    }

    const { data: credExistente } = await admin
      .from('credenciais_login_operacional')
      .select('usuario_id')
      .eq('usuario_id', usuarioId)
      .maybeSingle();

    const senhaOk = senhaNova?.trim();
    if (senhaOk) {
      if (senhaOk.length < 6) {
        return NextResponse.json({ error: 'A senha deve ter pelo menos 6 caracteres' }, { status: 400 });
      }
      const hash = await bcrypt.hash(senhaOk, 10);
      const { error: upCred } = await admin.from('credenciais_login_operacional').upsert({
        usuario_id: usuarioId,
        senha_hash: hash,
        updated_at: new Date().toISOString(),
      });
      if (upCred) {
        console.error(upCred);
        return NextResponse.json({ error: 'Falha ao gravar senha' }, { status: 500 });
      }
    } else if (!credExistente) {
      return NextResponse.json(
        { error: 'Defina uma senha (mín. 6 caracteres) para ativar o login deste usuário' },
        { status: 400 }
      );
    }

    const { error: upUser } = await admin
      .from('usuarios')
      .update({ login_operacional: loginN })
      .eq('id', usuarioId);

    if (upUser) {
      console.error(upUser);
      return NextResponse.json({ error: 'Falha ao atualizar login' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, loginOperacional: loginN });
  } catch {
    return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  }
}
