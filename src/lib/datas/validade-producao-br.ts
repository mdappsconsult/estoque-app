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
 * Retorna um ISO completo representando **meia-noite no fuso BR** do dia civil
 * "hoje + N dias" (America/Sao_Paulo). Use este valor para persistir em colunas
 * `timestamptz` (ex.: `itens.data_validade`, `etiquetas.data_validade`) sem
 * deslocar o dia ao exibir em pt-BR.
 */
export function calcularDataValidadeIsoMeiaNoiteBrAposDiasCorridos(diasValidade: number): string {
  const ymd = calcularDataValidadeYmdAposDiasCorridosBr(diasValidade);
  // ISO com offset fixo -03:00 (regra operacional do projeto para BR). Evita
  // "YYYY-MM-DD" ser interpretado como UTC e virar dia anterior no Brasil.
  return new Date(`${ymd}T00:00:00-03:00`).toISOString();
}

/**
 * Valor vindo do cliente ou cadastro só com dia (`YYYY-MM-DD`): Postgres grava como meia-noite **UTC**,
 * deslocando a validade na loja. Converte para o mesmo instante que usamos na produção (meia-noite BR).
 * ISO completo ou sentinela `2999-…` devolve sem alteração.
 */
export function normalizarDataValidadeSomenteDataParaTimestamptzBr(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  if (t.startsWith('2999')) return t;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    return new Date(`${t}T00:00:00-03:00`).toISOString();
  }
  return t;
}

/**
 * Formata validade para etiqueta quando o valor é `YYYY-MM-DD` ou ISO completo.
 * - `YYYY-MM-DD` puro: trata como dia civil informado (produção / legado).
 * - ISO com hora (`…T…`): usa o **dia civil em America/Sao_Paulo** — evita pegar só o prefixo
 *   `YYYY-MM-DD` em UTC (ex.: meia-noite UTC pode ser noite do dia anterior no BR).
 */
export function formatarValidadeDdMmAaEtiquetaBr(dataIso: string): string {
  const t = (dataIso || '').trim();
  if (!t) return '-';

  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)!;
    const d = parseInt(m[3], 10);
    const mo = parseInt(m[2], 10);
    const y2 = parseInt(m[1], 10) % 100;
    return `${String(d).padStart(2, '0')}/${String(mo).padStart(2, '0')}/${String(y2).padStart(2, '0')}`;
  }

  const data = new Date(t);
  if (Number.isNaN(data.getTime())) return '-';

  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(data);
  const [yy, mm, dd] = ymd.split('-');
  if (!yy || !mm || !dd) return '-';
  const y2 = parseInt(yy, 10) % 100;
  return `${dd}/${mm}/${String(y2).padStart(2, '0')}`;
}
