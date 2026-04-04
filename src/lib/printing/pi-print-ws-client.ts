/**
 * Cliente browser → serviço `pi-print-ws` no Raspberry (WebSocket).
 *
 * Ordem de resolução da URL:
 * 1. `NEXT_PUBLIC_PI_PRINT_WS_URL` (+ token/fila opcionais) — útil em dev/local.
 * 2. Tabela Supabase `config_impressao_pi` por `papel` (estoque | industria) — URL pública `wss://`.
 */

import {
  type ImpressaoPiPapel,
  getConfigImpressaoPiByPapel,
} from '@/lib/services/config-impressao-pi';

const DEFAULT_TIMEOUT_MS = 120_000;

function trim(s: string | undefined): string {
  return (s ?? '').trim();
}

export type PiPrintConnection = {
  wsUrl: string;
  token?: string;
  queue?: string;
};

/** Converte https://host → wss://host (ao colar URL do painel do túnel). */
export function normalizeWebSocketUrl(url: string): string {
  const t = trim(url);
  if (!t) return t;
  if (t.startsWith('https://')) return `wss://${t.slice(8)}`;
  if (t.startsWith('http://')) return `ws://${t.slice(7)}`;
  return t;
}

function connectionFromEnv(): PiPrintConnection | null {
  const raw = trim(process.env.NEXT_PUBLIC_PI_PRINT_WS_URL);
  if (!raw) return null;
  return {
    wsUrl: normalizeWebSocketUrl(raw),
    token: trim(process.env.NEXT_PUBLIC_PI_PRINT_WS_TOKEN) || undefined,
    queue: trim(process.env.NEXT_PUBLIC_PI_PRINT_QUEUE) || undefined,
  };
}

/**
 * URL efetiva do bridge: .env tem prioridade; senão lê `config_impressao_pi` no Supabase.
 * @param papel — `estoque` (separação/loja) ou `industria` (segundo Pi). Ignorado quando há env global.
 */
export async function resolvePiPrintConnection(
  papel: ImpressaoPiPapel = 'estoque'
): Promise<PiPrintConnection | null> {
  const fromEnv = connectionFromEnv();
  if (fromEnv) return fromEnv;

  try {
    const row = await getConfigImpressaoPiByPapel(papel);
    if (!row) return null;
    const url = trim(row.ws_public_url);
    if (!url) return null;
    return {
      wsUrl: normalizeWebSocketUrl(url),
      token: trim(row.ws_token) || undefined,
      queue: trim(row.cups_queue) || undefined,
    };
  } catch {
    return null;
  }
}

function buildWebSocketUrlFromConnection(conn: PiPrintConnection): string {
  const base = conn.wsUrl.trim();
  if (!base) throw new Error('URL WebSocket vazia.');
  const token = trim(conn.token);
  if (!token) return base;
  const join = base.includes('?') ? '&' : '?';
  return `${base}${join}token=${encodeURIComponent(token)}`;
}

/** Apenas variável de ambiente no build (não inclui Supabase). */
export function isPiPrintEnvConfigured(): boolean {
  return Boolean(trim(process.env.NEXT_PUBLIC_PI_PRINT_WS_URL));
}

/**
 * @deprecated Use `usePiPrintBridgeConfig().available` ou `resolvePiPrintConnection()`.
 * Mantido para compatibilidade: equivale a `isPiPrintEnvConfigured()`.
 */
export function isPiPrintConfigured(): boolean {
  return isPiPrintEnvConfigured();
}

/**
 * Envia HTML já montado (ex.: `gerarDocumentoHtmlEtiquetas`) para o Pi imprimir via CUPS.
 * Usa `preferCssPageSize` no servidor para respeitar várias folhas 60×30 (`@page` + `page-break`).
 */
export async function enviarHtmlParaPiPrintBridge(
  html: string,
  options?: {
    jobName?: string;
    queue?: string;
    timeoutMs?: number;
    /** Qual ponte no Supabase quando não há `connection` nem env (default estoque). */
    papel?: ImpressaoPiPapel;
    /** Se omitido, chama `resolvePiPrintConnection(papel)` de novo. */
    connection?: PiPrintConnection | null;
  }
): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('Impressão Pi só pode ser chamada no navegador.');
  }
  const papel = options?.papel ?? 'estoque';
  const conn =
    options?.connection ?? (await resolvePiPrintConnection(papel));
  if (!conn) {
    throw new Error(
      'Impressão na estação não configurada. Use NEXT_PUBLIC_PI_PRINT_WS_URL no ambiente ou preencha config_impressao_pi no Supabase (papel estoque/industria). Veja Configurações → Impressoras e docs/IMPRESSAO_PI_ACESSO_REMOTO.md.'
    );
  }
  const wsUrl = buildWebSocketUrlFromConnection(conn);
  const queue = options?.queue ?? conn.queue;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const jobName = options?.jobName ?? 'etiquetas';

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const ws = new WebSocket(wsUrl);

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      fn();
    };

    const timer = window.setTimeout(() => {
      finish(() => reject(new Error('Tempo esgotado ao falar com a estação de impressão (Pi).')));
    }, timeoutMs);

    ws.onerror = () => {
      finish(() =>
        reject(
          new Error(
            'Não foi possível conectar ao WebSocket. Confira URL (wss://), túnel ativo e serviço pi-print-ws no Raspberry.'
          )
        )
      );
    };

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: 'print',
          html,
          preferCssPageSize: true,
          jobName: jobName.slice(0, 120),
          ...(queue ? { queue } : {}),
        })
      );
    };

    ws.onmessage = (ev) => {
      let payload: { ok?: boolean; error?: string };
      try {
        payload = JSON.parse(String(ev.data)) as { ok?: boolean; error?: string };
      } catch {
        finish(() => reject(new Error('Resposta inválida da estação de impressão.')));
        return;
      }
      if (payload.ok) {
        finish(() => resolve());
      } else {
        finish(() => reject(new Error(payload.error || 'Falha ao imprimir na estação (Pi).')));
      }
    };
  });
}
