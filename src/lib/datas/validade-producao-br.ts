/**
 * Validade do acabado na produção: "hoje + N dias" em calendário civil de **America/Sao_Paulo**
 * (sem depender do fuso do servidor nem de `toISOString()` em cima de `Date` local).
 */
export function calcularDataValidadeYmdAposDiasCorridosBr(diasValidade: number): string {
  if (!Number.isInteger(diasValidade) || diasValidade <= 0) {
    throw new Error('Dias de validade deve ser um número inteiro maior que zero');
  }
  const hojeYmd = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const [y, mo, da] = hojeYmd.split('-').map((x) => parseInt(x, 10));
  const t0 = Date.UTC(y, mo - 1, da);
  const t1 = t0 + diasValidade * 86_400_000;
  return new Date(t1).toISOString().slice(0, 10);
}

/**
 * Formata validade para etiqueta quando o valor é `YYYY-MM-DD` ou ISO completo.
 * Evita `new Date('2026-04-22')` (meia-noite UTC → dia anterior em pt-BR).
 */
export function formatarValidadeDdMmAaEtiquetaBr(dataIso: string): string {
  const t = (dataIso || '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) {
    const d = parseInt(m[3], 10);
    const mo = parseInt(m[2], 10);
    const y2 = parseInt(m[1], 10) % 100;
    return `${String(d).padStart(2, '0')}/${String(mo).padStart(2, '0')}/${String(y2).padStart(2, '0')}`;
  }
  const data = new Date(dataIso);
  if (Number.isNaN(data.getTime())) return '-';
  const d = String(data.getDate()).padStart(2, '0');
  const mo = String(data.getMonth() + 1).padStart(2, '0');
  const y = String(data.getFullYear() % 100).padStart(2, '0');
  return `${d}/${mo}/${y}`;
}
