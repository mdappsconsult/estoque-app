/** Início do dia civil em America/Sao_Paulo (UTC ISO para filtros Supabase). */

const TZ = 'America/Sao_Paulo';

/** YYYY-MM-DD do dia civil atual em São Paulo. */
export function ymdHojeBr(d: Date = new Date()): string {
  return d.toLocaleDateString('sv-SE', { timeZone: TZ });
}

/** ISO do instante 00:00:00.000 no dia civil de São Paulo (offset -03:00 fixo). */
export function inicioDiaBrIso(ymd?: string): string {
  const dia = ymd || ymdHojeBr();
  return `${dia}T03:00:00.000Z`;
}

/** ISO do instante 00:00:00.000 do dia civil seguinte em São Paulo. */
export function inicioProximoDiaBrIso(ymd?: string): string {
  const base = ymd || ymdHojeBr();
  const [y, m, d] = base.split('-').map(Number);
  const prox = new Date(Date.UTC(y, m - 1, d + 1));
  const ymdProx = prox.toISOString().slice(0, 10);
  return `${ymdProx}T03:00:00.000Z`;
}
