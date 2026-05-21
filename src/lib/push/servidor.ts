import webpush from 'web-push';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

let configurado = false;

function configurarVapid(): { ok: true } | { ok: false; erro: string } {
  if (configurado) return { ok: true };
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:contato@acaidokim.com.br';
  if (!pub || !priv) {
    return {
      ok: false,
      erro: 'VAPID keys ausentes (NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).',
    };
  }
  webpush.setVapidDetails(subject, pub, priv);
  configurado = true;
  return { ok: true };
}

export interface PayloadPush {
  titulo: string;
  corpo: string;
  /** URL para abrir no clique. Default: `/protocolos`. */
  url?: string;
  /** Agrupador no SO (notificações novas substituem com a mesma tag). */
  tag?: string;
}

/**
 * Envia o mesmo payload para todos os endpoints de uma lista de usuários.
 * Endpoints inválidos (404/410) são apagados do banco automaticamente
 * — o navegador descartou a inscrição (desinstalou, limpou cookies etc.).
 */
export async function enviarPushParaUsuarios(
  usuariosIds: string[],
  payload: PayloadPush
): Promise<{ enviadas: number; falhas: number; semInscricao: number }> {
  const ids = Array.from(new Set(usuariosIds.filter((s) => typeof s === 'string' && s.length > 0)));
  if (ids.length === 0) return { enviadas: 0, falhas: 0, semInscricao: 0 };

  const cfg = configurarVapid();
  if (!cfg.ok) {
    console.warn('[push] configuração ausente:', cfg.erro);
    return { enviadas: 0, falhas: 0, semInscricao: 0 };
  }

  const admin = createSupabaseAdmin();
  const { data: inscricoes, error } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('usuario_id', ids);
  if (error) {
    console.error('[push] consulta de inscrições:', error);
    return { enviadas: 0, falhas: 0, semInscricao: 0 };
  }

  if (!inscricoes || inscricoes.length === 0) {
    return { enviadas: 0, falhas: 0, semInscricao: ids.length };
  }

  const body = JSON.stringify({
    titulo: payload.titulo,
    corpo: payload.corpo,
    url: payload.url || '/protocolos',
    tag: payload.tag || 'protocolo',
  });

  const idsParaRemover: string[] = [];
  let enviadas = 0;
  let falhas = 0;

  await Promise.all(
    inscricoes.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint as string,
            keys: { p256dh: s.p256dh as string, auth: s.auth as string },
          },
          body,
          {
            TTL: 60 * 60,
            // iOS Safari agrupa/silencia pushes "normal"; "high" força entrega imediata e visual.
            urgency: 'high',
          }
        );
        enviadas++;
      } catch (e) {
        const statusCode = (e as { statusCode?: number }).statusCode;
        // 404 = endpoint sumiu | 410 = "Gone" (inscrição revogada).
        if (statusCode === 404 || statusCode === 410) {
          idsParaRemover.push(s.id as string);
        } else {
          falhas++;
          console.warn('[push] falha ao enviar (status %s):', statusCode, e);
        }
      }
    })
  );

  if (idsParaRemover.length > 0) {
    const { error: eDel } = await admin
      .from('push_subscriptions')
      .delete()
      .in('id', idsParaRemover);
    if (eDel) console.warn('[push] limpeza de endpoints inválidos:', eDel);
  }

  return { enviadas, falhas, semInscricao: 0 };
}
