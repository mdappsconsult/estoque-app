import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { formatNodeFetchError } from '@/lib/errMessage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAPEIS = ['estoque', 'industria'] as const;

const noStoreJson = (body: object, init?: { status?: number }) =>
  NextResponse.json(body, {
    ...init,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });

function wssToHealthUrl(wss: string): string | null {
  const t = wss.trim();
  if (!t.startsWith('wss://')) return null;
  const rest = t.slice(6).replace(/\/$/, '');
  return `https://${rest}/health`;
}

export async function GET(req: NextRequest) {
  const papel = req.nextUrl.searchParams.get('papel') ?? 'estoque';
  if (!PAPEIS.includes(papel as (typeof PAPEIS)[number])) {
    return noStoreJson({ error: 'papel inválido' }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return noStoreJson({ error: 'Supabase não configurado no servidor' }, { status: 500 });
  }

  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from('config_impressao_pi')
    .select('ws_public_url')
    .eq('papel', papel)
    .maybeSingle();

  if (error) {
    return noStoreJson({ error: error.message }, { status: 500 });
  }

  const healthUrl = data?.ws_public_url ? wssToHealthUrl(String(data.ws_public_url)) : null;
  if (!healthUrl) {
    return noStoreJson({
      online: false,
      message: 'URL pública (wss://) não configurada para esta ponte.',
    });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(healthUrl, {
      signal: ctrl.signal,
      cache: 'no-store',
      headers: { Accept: 'text/plain,*/*' },
    });
    clearTimeout(timer);
    const text = await res.text();
    const online = res.ok && text.includes('pi-print-ws');
    return noStoreJson({
      online,
      statusCode: res.status,
      message: online
        ? 'Bridge respondeu (pi-print-ws).'
        : `Resposta inesperada (HTTP ${res.status}).`,
    });
  } catch (e) {
    clearTimeout(timer);
    let message = formatNodeFetchError(e);
    // Alguns runtimes em produção devolvem só "fetch failed" sem `error.cause`.
    if (message === 'fetch failed') {
      try {
        const host = new URL(healthUrl).hostname;
        message = `fetch failed — host «${host}»: costuma ser túnel quick antigo (atualize ws_public_url no Supabase / sync no Pi), Pi ou cloudflared parados, ou firewall.`;
      } catch {
        message += ' Confira ws_public_url (wss://) no Supabase.';
      }
    }
    return noStoreJson({ online: false, message });
  }
}
