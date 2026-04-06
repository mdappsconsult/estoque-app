import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveEnvPiPrintWssDetail } from '@/lib/printing/pi-print-wss-env';
import type { ImpressaoPiPapel } from '@/lib/services/config-impressao-pi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAPEIS: ImpressaoPiPapel[] = ['estoque', 'industria'];

/**
 * Indica se a URL efetiva vem do ambiente (Railway) ou do Supabase, e se o valor no banco é quick tunnel.
 * Usado na tela Configurações → Impressoras para avisos sem expor segredos.
 */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json(
      { error: 'Supabase não configurado no servidor' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from('config_impressao_pi')
    .select('papel, ws_public_url');

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const byPapel = new Map(
    (data ?? []).map((r) => [String(r.papel) as ImpressaoPiPapel, String(r.ws_public_url ?? '')])
  );

  const bridges = PAPEIS.map((papel) => {
    const envRes = resolveEnvPiPrintWssDetail(papel);
    const dbUrl = byPapel.get(papel) ?? '';
    return {
      papel,
      envOverridesDatabase: Boolean(envRes.kind),
      envKind: envRes.kind,
      databaseUrlIsQuickTunnel: /\.trycloudflare\.com/i.test(dbUrl),
    };
  });

  return NextResponse.json(
    { bridges },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}
