/** Formatação consistente para telas operacionais (fuso São Paulo). */

const TZ = 'America/Sao_Paulo';

export function formatarDataHoraBr(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: TZ,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return '—';
  }
}

export function formatarSoDataBr(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: TZ,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return '—';
  }
}

/** “Agora” legível para cabeçalho de auditoria (mesmo fuso). */
export function formatarInstanteConsultaBr(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ,
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  }).format(d);
}
