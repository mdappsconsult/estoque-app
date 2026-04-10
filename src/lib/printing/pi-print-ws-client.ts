/**
 * Cliente browser → serviço `pi-print-ws` no Raspberry (WebSocket).
 *
 * Ordem de resolução da URL:
 * 1. `NEXT_PUBLIC_PI_PRINT_WS_URL` (+ token/fila opcionais) — útil em dev/local.
 * 2. `NEXT_PUBLIC_PI_PRINT_WS_URL_ESTOQUE` ou `NEXT_PUBLIC_PI_PRINT_WS_URL_INDUSTRIA` — URL estável no
 *    deploy (ex. Railway + túnel nomeado); token/fila podem vir do `.env` ou da linha no Supabase.
 * 3. Coluna `ws_public_url` em `config_impressao_pi` (sync do Pi ou edição manual).
 *
 * O payload de impressão deve incluir `widthMm`/`heightMm` (via `formatoEtiquetaPdf` no app) para o Pi
 * dimensionar o viewport do Chromium alinhado à folha.
 */

import {
  type ImpressaoPiPapel,
  getConfigImpressaoPiByPapel,
} from '@/lib/services/config-impressao-pi';
import {
  normalizeWebSocketUrl,
  resolveEnvPiPrintWssUrl,
} from '@/lib/printing/pi-print-wss-env';
import {
  FORMATO_CONFIG,
  gerarDocumentoHtmlEtiquetas,
  prepararEtiquetas60x30ParaPilhasEsquerdaDireita,
  type EtiquetaParaImpressao,
  type FormatoEtiqueta,
} from '@/lib/printing/label-print';

const DEFAULT_TIMEOUT_MS = 120_000;

function trim(s: string | undefined): string {
  return (s ?? '').trim();
}

export type PiPrintConnection = {
  wsUrl: string;
  token?: string;
  queue?: string;
};

export { normalizeWebSocketUrl } from '@/lib/printing/pi-print-wss-env';

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
 * URL efetiva do bridge: env global → env por papel → `config_impressao_pi` no Supabase.
 * @param papel — `estoque` (separação/loja) ou `industria` (segundo Pi). Ignorado quando há env global.
 */
export async function resolvePiPrintConnection(
  papel: ImpressaoPiPapel = 'estoque'
): Promise<PiPrintConnection | null> {
  const fromEnv = connectionFromEnv();
  if (fromEnv) return fromEnv;

  try {
    const row = await getConfigImpressaoPiByPapel(papel).catch(() => null);
    const envWss = resolveEnvPiPrintWssUrl(papel);
    const fromRow = row && trim(row.ws_public_url);
    const wssBase = envWss ?? (fromRow ? normalizeWebSocketUrl(fromRow) : '');
    if (!wssBase) return null;
    return {
      wsUrl: wssBase,
      token:
        trim(process.env.NEXT_PUBLIC_PI_PRINT_WS_TOKEN) ||
        trim(row?.ws_token) ||
        undefined,
      queue:
        trim(process.env.NEXT_PUBLIC_PI_PRINT_QUEUE) ||
        trim(row?.cups_queue) ||
        undefined,
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

/** True se alguma URL Pi vem só de variável de ambiente (sem depender do Supabase para o host). */
export function isPiPrintEnvConfigured(): boolean {
  return Boolean(
    trim(process.env.NEXT_PUBLIC_PI_PRINT_WS_URL) ||
      trim(process.env.NEXT_PUBLIC_PI_PRINT_WS_URL_ESTOQUE) ||
      trim(process.env.NEXT_PUBLIC_PI_PRINT_WS_URL_INDUSTRIA)
  );
}

/**
 * @deprecated Use `usePiPrintBridgeConfig().available` ou `resolvePiPrintConnection()`.
 * Mantido para compatibilidade: equivale a `isPiPrintEnvConfigured()`.
 */
export function isPiPrintConfigured(): boolean {
  return isPiPrintEnvConfigured();
}

/** Máximo de etiquetas por envio ao Pi: um único JSON com HTML enorme pode estourar frame WS ou memória no Chromium da estação. */
export const ETIQUETAS_POR_JOB_PI_PADRAO = 40;

/**
 * Gera HTML e envia em vários jobs sequenciais quando a lista é grande (remessas 200–400+ itens).
 */
export async function enviarEtiquetasParaPiEmMultiplosJobs(
  etiquetas: EtiquetaParaImpressao[],
  formato: FormatoEtiqueta,
  options: {
    connection: PiPrintConnection;
    jobNameBase: string;
    /** Default {@link ETIQUETAS_POR_JOB_PI_PADRAO}. */
    porJob?: number;
    papel?: ImpressaoPiPapel;
    /** Pausa entre jobs para o CUPS “respirar” (ms). Default 350. */
    delayEntreJobsMs?: number;
    /**
     * 60×30: quando true, prepara o lote inteiro antes de fatiar (pilhas esq/dir por número).
     * Omitido/false = pares consecutivos em cada fatia (alinha com impressão por produto no estoque).
     */
    preparar60x30PilhasPorLado?: boolean;
  }
): Promise<void> {
  if (etiquetas.length === 0) return;
  const porJob = Math.max(5, Math.min(150, options.porJob ?? ETIQUETAS_POR_JOB_PI_PADRAO));
  const base = options.jobNameBase.trim().slice(0, 72) || 'etiquetas';
  const aplicarPilhas60 =
    formato === '60x30' && options.preparar60x30PilhasPorLado === true;
  const lista = aplicarPilhas60
    ? prepararEtiquetas60x30ParaPilhasEsquerdaDireita(etiquetas)
    : etiquetas;
  const totalJobs = Math.ceil(lista.length / porJob);

  for (let i = 0; i < lista.length; i += porJob) {
    const slice = lista.slice(i, i + porJob);
    const html = await gerarDocumentoHtmlEtiquetas(slice, formato, {
      preparacao60x30JaAplicada: aplicarPilhas60,
    });
    const idx = Math.floor(i / porJob) + 1;
    const jobName =
      totalJobs > 1 ? `${base} ${idx}/${totalJobs}`.slice(0, 120) : base.slice(0, 120);
    const timeoutMs = Math.min(600_000, 45_000 + slice.length * 3_000);
    await enviarHtmlParaPiPrintBridge(html, {
      jobName,
      connection: options.connection,
      papel: options.papel,
      formatoEtiquetaPdf: formato,
      timeoutMs,
    });
    const delay = options.delayEntreJobsMs ?? 350;
    if (i + porJob < lista.length && delay > 0) {
      await new Promise((r) => setTimeout(r, delay));
    }
  }
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
    /**
     * Formato da etiqueta: define `widthMm`/`heightMm` no Pi para viewport do Chromium alinhada à folha.
     * Sem isso, o app envia 60×60 mm (alinhado ao padrão do Pi).
     */
    formatoEtiquetaPdf?: FormatoEtiqueta;
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
      'Impressão na estação não configurada. Use NEXT_PUBLIC_PI_PRINT_WS_URL ou NEXT_PUBLIC_PI_PRINT_WS_URL_ESTOQUE/INDUSTRIA no ambiente, ou preencha config_impressao_pi no Supabase. Veja Configurações → Impressoras e docs/IMPRESSAO_PI_ACESSO_REMOTO.md.'
    );
  }
  const wsUrl = buildWebSocketUrlFromConnection(conn);
  const queue = options?.queue ?? conn.queue;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const jobName = options?.jobName ?? 'etiquetas';
  const fmtPdf = options?.formatoEtiquetaPdf;
  const cfgPdf = fmtPdf ? FORMATO_CONFIG[fmtPdf] : null;
  const widthMm = cfgPdf?.widthMm ?? 60;
  const heightMm = cfgPdf?.heightMm ?? 60;

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
          widthMm,
          heightMm,
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
