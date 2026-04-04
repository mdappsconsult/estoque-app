/** Mensagem segura a partir de `unknown` (catch, APIs). */
export function errMessage(err: unknown, fallback = 'Erro'): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return fallback;
}
