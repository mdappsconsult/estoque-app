import dns from 'node:dns';
import type { ClientRequest } from 'node:http';
import https from 'node:https';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { formatNodeFetchError } from '@/lib/errMessage';
import {
  resolveEnvPiPrintWssDetail,
  type PiPrintEnvWssKind,
} from '@/lib/printing/pi-print-wss-env';
import type { ImpressaoPiPapel } from '@/lib/services/config-impressao-pi';

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

/** Corpo típico da edge: `error code: 1033` — túnel sem cloudflared conectado. */
function mensagemHealthInesperada(status: number, body: string): string {
  const b = body.trim();
  if (status === 530) {
    if (/1033/i.test(b)) {
      return (
        'Cloudflare Tunnel sem conector ativo (HTTP 530, código 1033): a URL resolve na Cloudflare, mas nenhum cloudflared saudável está ligado ao túnel. ' +
        'No Raspberry: conferir `systemctl status` do serviço cloudflared do túnel nomeado, reiniciar se estiver parado; internet de saída; credenciais/token no painel Zero Trust → Tunnels.'
      );
    }
    return (
      'Cloudflare não encaminhou para a origem (HTTP 530). Confira CNAME do túnel (*.cfargotunnel.com), proxy ativo e se cloudflared + pi-print-ws estão em execução no Pi.'
    );
  }
  return `Resposta inesperada (HTTP ${status}).`;
}

/** Alguns hosts (ex. Railway) usam resolver interno com NXDOMAIN atrasado; 1.1.1.1/8.8.8.8 já resolvem o nome. */
function isLikelyDnsFailure(e: unknown): boolean {
  const code = (e as { cause?: { code?: string } })?.cause?.code;
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /ENOTFOUND|getaddrinfo EAI_AGAIN/i.test(msg);
}

let publicDnsFallbackApplied = false;

function applyPublicDnsFallbackOnce(): void {
  if (publicDnsFallbackApplied) return;
  publicDnsFallbackApplied = true;
  const raw = process.env.PI_PRINT_STATUS_DNS_SERVERS;
  const list = raw
    ? raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : ['1.1.1.1', '8.8.8.8'];
  try {
    dns.setServers(list);
  } catch {
    /* ignore */
  }
}

/**
 * Quando o resolver do processo não resolve o hostname (macOS/VPN/sandbox), DoH + HTTPS ao IP com SNI
 * costuma funcionar porque usa apenas HTTPS (443) para 1.1.1.1 e para a edge Cloudflare.
 */
async function fetchHealthViaDoh(healthUrlStr: string, signal: AbortSignal): Promise<Response> {
  const u = new URL(healthUrlStr);
  const hostname = u.hostname;
  const path = `${u.pathname}${u.search}` || '/health';

  const dohRes = await fetch(
    `https://1.1.1.1/dns-query?name=${encodeURIComponent(hostname)}&type=A`,
    {
      signal,
      cache: 'no-store',
      headers: { accept: 'application/dns-json' },
    }
  );
  if (!dohRes.ok) {
    throw new Error(`DoH HTTP ${dohRes.status}`);
  }
  const j = (await dohRes.json()) as {
    Status: number;
    Answer?: Array<{ data: string }>;
  };
  if (j.Status !== 0 || !j.Answer?.length) {
    throw new Error('DoH: sem registo A');
  }
  const ip = j.Answer.map((a) => a.data).find((d) => /^\d{1,3}(\.\d{1,3}){3}$/.test(d));
  if (!ip) {
    throw new Error('DoH: sem IPv4');
  }

  const { statusCode, body } = await new Promise<{
    statusCode: number;
    body: string;
  }>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const holder: { req?: ClientRequest } = {};
    const onAbort = () => {
      holder.req?.destroy();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });

    holder.req = https.request(
      {
        hostname: ip,
        port: 443,
        path,
        method: 'GET',
        servername: hostname,
        headers: {
          Host: hostname,
          Accept: 'text/plain,*/*',
        },
        timeout: 7000,
      },
      (inRes) => {
        signal.removeEventListener('abort', onAbort);
        const chunks: Buffer[] = [];
        inRes.on('data', (c: Buffer | string) =>
          chunks.push(typeof c === 'string' ? Buffer.from(c) : c)
        );
        inRes.on('end', () => {
          resolve({
            statusCode: inRes.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );
    const client = holder.req;
    client.on('error', (err) => {
      signal.removeEventListener('abort', onAbort);
      reject(err);
    });
    client.on('timeout', () => {
      signal.removeEventListener('abort', onAbort);
      client.destroy();
      reject(new Error('HTTPS health timeout'));
    });
    client.end();
  });

  return new Response(body, { status: statusCode });
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
  const papelTyped = papel as ImpressaoPiPapel;
  const envRes = resolveEnvPiPrintWssDetail(papelTyped);

  const { data, error } = await supabase
    .from('config_impressao_pi')
    .select('ws_public_url')
    .eq('papel', papel)
    .maybeSingle();

  if (error) {
    return noStoreJson({ error: error.message }, { status: 500 });
  }

  const wssForHealth =
    envRes.url ?? (data?.ws_public_url ? String(data.ws_public_url).trim() : '');
  const healthUrl = wssForHealth ? wssToHealthUrl(wssForHealth) : null;
  const urlSource: PiPrintEnvWssKind | 'database' | 'none' = envRes.kind ?? (wssForHealth ? 'database' : 'none');
  if (!healthUrl) {
    return noStoreJson({
      online: false,
      urlSource: 'none' as const,
      message: 'URL pública (wss://) não configurada para esta ponte.',
    });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  const doFetch = () =>
    fetch(healthUrl, {
      signal: ctrl.signal,
      cache: 'no-store',
      headers: { Accept: 'text/plain,*/*' },
    });

  try {
    let res: Response;
    try {
      res = await doFetch();
    } catch (first) {
      if (isLikelyDnsFailure(first)) {
        applyPublicDnsFallbackOnce();
        try {
          res = await doFetch();
        } catch (second) {
          if (isLikelyDnsFailure(second)) {
            res = await fetchHealthViaDoh(healthUrl, ctrl.signal);
          } else {
            throw second;
          }
        }
      } else {
        throw first;
      }
    }
    clearTimeout(timer);
    const text = await res.text();
    const online = res.ok && text.includes('pi-print-ws');
    return noStoreJson({
      online,
      statusCode: res.status,
      urlSource,
      message: online
        ? 'Bridge respondeu (pi-print-ws).'
        : mensagemHealthInesperada(res.status, text),
    });
  } catch (e) {
    clearTimeout(timer);
    let message = formatNodeFetchError(e);
    // Alguns runtimes em produção devolvem só "fetch failed" sem `error.cause`.
    if (message === 'fetch failed') {
      try {
        const host = new URL(healthUrl).hostname;
        if (urlSource === 'database') {
          message = `fetch failed — host «${host}»: costuma ser túnel quick antigo (atualize ws_public_url no Supabase / sync no Pi), Pi ou cloudflared parados, ou firewall. Para produção, prefira túnel nomeado ou variável NEXT_PUBLIC_PI_PRINT_WS_URL_* no deploy.`;
        } else {
          message = `fetch failed — host «${host}»: confira túnel Cloudflare e serviço pi-print-ws no Raspberry; a URL ativa vem de NEXT_PUBLIC_PI_PRINT_WS_* no servidor.`;
        }
      } catch {
        message +=
          urlSource === 'database'
            ? ' Confira ws_public_url (wss://) no Supabase.'
            : ' Confira NEXT_PUBLIC_PI_PRINT_WS_* no servidor.';
      }
    }
    return noStoreJson({ online: false, message, urlSource });
  }
}
