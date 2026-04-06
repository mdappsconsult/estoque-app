import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { formatNodeFetchError } from '@/lib/errMessage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAPEIS = ['estoque', 'industria'] as const;

function wssToHealthUrl(wss: string): string | null {
  const t = wss.trim();
  if (!t.startsWith('wss://')) return null;
  const rest = t.slice(6).replace(/\/$/, '');
  return `https://${rest}/health`;
}

export async function GET(req: NextRequest) {
  const papel = req.nextUrl.searchParams.get('papel') ?? 'estoque';
  if (!PAPEIS.includes(papel as (typeof PAPEIS)[number])) {
    return NextResponse.json({ error: 'papel inválido' }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: 'Supabase não configurado no servidor' }, { status: 500 });
  }

  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from('config_impressao_pi')
    .select('ws_public_url')
    .eq('papel', papel)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const healthUrl = data?.ws_public_url ? wssToHealthUrl(String(data.ws_public_url)) : null;
  if (!healthUrl) {
    return NextResponse.json({
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
    return NextResponse.json({
      online,
      statusCode: res.status,
      message: online
        ? 'Bridge respondeu (pi-print-ws).'
        : `Resposta inesperada (HTTP ${res.status}).`,
    });
  } catch (e) {
    clearTimeout(timer);
    const msg = formatNodeFetchError(e);
    return NextResponse.json({ online: false, message: msg });
  }
}
