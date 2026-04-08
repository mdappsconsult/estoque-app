/** Mensagem segura a partir de `unknown` (catch, APIs). */
export function errMessage(err: unknown, fallback = 'Erro'): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null) {
    const o = err as Record<string, unknown>;
    if (typeof o.message === 'string' && o.message.trim()) return o.message;
    if (typeof o.details === 'string' && o.details.trim()) return o.details;
    if (typeof o.hint === 'string' && o.hint.trim()) return o.hint;
    if (typeof o.error_description === 'string') return o.error_description;
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
