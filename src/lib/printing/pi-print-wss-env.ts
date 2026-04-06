import type { ImpressaoPiPapel } from '@/lib/services/config-impressao-pi';

function trim(s: string | undefined): string {
  return (s ?? '').trim();
}

/** Converte https://host → wss://host (URL colada do painel do túnel). */
export function normalizeWebSocketUrl(url: string): string {
  const t = trim(url);
  if (!t) return t;
  if (t.startsWith('https://')) return `wss://${t.slice(8)}`;
  if (t.startsWith('http://')) return `ws://${t.slice(7)}`;
  return t;
}

export type PiPrintEnvWssKind = 'global' | 'papel';

export type PiPrintEnvWssResolution =
  | { url: string; kind: PiPrintEnvWssKind }
  | { url: null; kind: null };

/**
 * URL pública wss:// só a partir do ambiente (sem Supabase).
 * Ordem: NEXT_PUBLIC_PI_PRINT_WS_URL → NEXT_PUBLIC_PI_PRINT_WS_URL_ESTOQUE | INDUSTRIA.
 *
 * Em produção, defina URL de túnel **nomeado** (ou estável) aqui no Railway/build para não
 * depender de `ws_public_url` no banco quando o quick tunnel Cloudflare rotacionar o hostname.
 */
export function resolveEnvPiPrintWssDetail(
  papel: ImpressaoPiPapel
): PiPrintEnvWssResolution {
  const globalUrl = trim(process.env.NEXT_PUBLIC_PI_PRINT_WS_URL);
  if (globalUrl) {
    return { url: normalizeWebSocketUrl(globalUrl), kind: 'global' };
  }
  const per =
    papel === 'estoque'
      ? trim(process.env.NEXT_PUBLIC_PI_PRINT_WS_URL_ESTOQUE)
      : trim(process.env.NEXT_PUBLIC_PI_PRINT_WS_URL_INDUSTRIA);
  if (per) {
    return { url: normalizeWebSocketUrl(per), kind: 'papel' };
  }
  return { url: null, kind: null };
}

export function resolveEnvPiPrintWssUrl(papel: ImpressaoPiPapel): string | null {
  return resolveEnvPiPrintWssDetail(papel).url;
}
