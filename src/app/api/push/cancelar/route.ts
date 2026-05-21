import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { validarCredencialOperacional } from '@/lib/services/operacional-auth-server';
import { errMessage } from '@/lib/errMessage';

type Body = {
  login?: string;
  senha?: string;
  endpoint?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const auth = await validarCredencialOperacional(body.login ?? '', body.senha ?? '');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const endpoint = (body.endpoint || '').trim();
    if (!endpoint) {
      return NextResponse.json({ error: 'Endpoint vazio.' }, { status: 400 });
    }

    const admin = createSupabaseAdmin();
    await admin
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint)
      .eq('usuario_id', auth.usuario.id);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: errMessage(e, 'Falha ao cancelar') }, { status: 500 });
  }
}
