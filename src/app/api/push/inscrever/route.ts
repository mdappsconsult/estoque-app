import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { validarCredencialOperacional } from '@/lib/services/operacional-auth-server';
import { errMessage } from '@/lib/errMessage';

type Body = {
  login?: string;
  senha?: string;
  endpoint?: string;
  p256dh?: string;
  auth?: string;
  userAgent?: string | null;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const auth = await validarCredencialOperacional(body.login ?? '', body.senha ?? '');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const endpoint = (body.endpoint || '').trim();
    const p256dh = (body.p256dh || '').trim();
    const authKey = (body.auth || '').trim();
    if (!endpoint || !p256dh || !authKey) {
      return NextResponse.json(
        { error: 'Dados de inscrição incompletos (endpoint, p256dh ou auth).' },
        { status: 400 }
      );
    }

    const admin = createSupabaseAdmin();
    const { error } = await admin
      .from('push_subscriptions')
      .upsert(
        {
          usuario_id: auth.usuario.id,
          endpoint,
          p256dh,
          auth: authKey,
          user_agent: body.userAgent ?? null,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' }
      );
    if (error) {
      console.error('[push/inscrever]', error);
      return NextResponse.json({ error: 'Não foi possível registrar.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: errMessage(e, 'Falha ao inscrever') }, { status: 500 });
  }
}
