/** Mensagem segura a partir de `unknown` (catch, APIs). */
export function errMessage(err: unknown, fallback = 'Erro'): string {
  if (err instanceof Error) {
    const ex = err as Error & { details?: string; hint?: string; code?: string };
    const parts = [
      ex.message,
      typeof ex.details === 'string' ? ex.details : '',
      typeof ex.hint === 'string' ? ex.hint : '',
      typeof ex.code === 'string' && ex.code ? `[${ex.code}]` : '',
    ]
      .map((s) => (typeof s === 'string' ? s.trim() : ''))
      .filter(Boolean);
    if (parts.length) return [...new Set(parts)].join(' — ');
    return ex.message?.trim() || fallback;
  }
  if (typeof err === 'object' && err !== null) {
    const o = err as Record<string, unknown>;
    if (typeof o.message === 'string' && o.message.trim()) return o.message;
    if (typeof o.details === 'string' && o.details.trim()) return o.details;
    if (typeof o.hint === 'string' && o.hint.trim()) return o.hint;
    if (typeof o.error_description === 'string') return o.error_description;
    if (typeof o.code === 'string' && o.code.trim()) return o.code;
  }
  return fallback;
}

/**
 * Enriquece `TypeError: fetch failed` (Node/undici) com `error.cause` (ex.: ENOTFOUND, ECONNREFUSED).
 */
export function formatNodeFetchError(e: unknown): string {
  if (!(e instanceof Error)) return 'Falha de rede';
  if (e.name === 'AbortError') return 'Tempo esgotado ao contatar o túnel.';
  let msg = e.message;
  const cause = e.cause;
  if (cause instanceof Error) {
    msg += ` — ${cause.message}`;
    const code = (cause as NodeJS.ErrnoException).code;
    if (code) msg += ` [${code}]`;
  } else if (cause && typeof cause === 'object' && 'code' in cause) {
    const code = (cause as { code: unknown }).code;
    if (code != null) msg += ` [${String(code)}]`;
  }
  return msg;
}

/**
 * Mensagem em PT-BR quando o `fetch` no navegador falha antes da resposta (rede, SSL, proxy, timeout de rota).
 * Usado em fluxos operacionais (ex.: gravar remessa em Separar por Loja).
 */
export function mensagemErroFetchClienteOperacional(err: unknown): string {
  if (!(err instanceof Error)) {
    return 'Não foi possível contatar o servidor. Verifique a internet e tente de novo.';
  }
  const m = err.message.trim();
  const rede =
    m === 'fetch failed' ||
    m === 'Failed to fetch' ||
    m === 'NetworkError when attempting to fetch resource.' ||
    m === 'Load failed' ||
    (err instanceof TypeError && /\bfetch\b/i.test(m));
  if (!rede) {
    return errMessage(err, 'Erro ao registrar separação');
  }
  const tech = formatNodeFetchError(err);
  const sufixoTecnico =
    tech.length > m.length + 3 || (tech !== m && tech !== 'Falha de rede') ? ` Detalhe técnico: ${tech}` : '';
  return (
    'Não foi possível gravar a remessa: a conexão com o servidor não completou (internet instável, firewall, certificado ou serviço temporariamente indisponível).' +
    sufixoTecnico +
    ' Mantenha esta aba aberta, aguarde até cerca de um minuto em remessas grandes e tente de novo; se repetir, teste outra rede ou Wi‑Fi.'
  );
}
