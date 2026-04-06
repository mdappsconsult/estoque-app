/** Mensagem segura a partir de `unknown` (catch, APIs). */
export function errMessage(err: unknown, fallback = 'Erro'): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === 'string') return m;
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
