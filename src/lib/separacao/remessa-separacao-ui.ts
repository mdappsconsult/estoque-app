/** UI legível para remessas «Separar por Loja» (lote SEP-{viagem_id}). */

/**
 * Extrai o id da viagem do lote e normaliza em minúsculas para bater com `transferencias.viagem_id`
 * no PostgREST (evita `Map.get` falhar por diferença de casing entre `etiquetas.lote` e o UUID do banco).
 */
export function parseViagemIdDeLoteSep(lote: string | null | undefined): string | null {
  if (!lote || !lote.startsWith('SEP-')) return null;
  const id = lote.slice(4).trim().toLowerCase();
  return id.length > 0 ? id : null;
}

export function formatarDataHoraRemessaPt(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function formatarDataRemessaPt(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

const STATUS_TRANSFERENCIA_PT: Record<string, string> = {
  AWAITING_ACCEPT: 'Aguardando aceite',
  ACCEPTED: 'Aceita',
  IN_TRANSIT: 'Em trânsito',
  DELIVERED: 'Entregue',
  DIVERGENCE: 'Divergência',
};

export function statusTransferenciaLegivel(status: string): string {
  return STATUS_TRANSFERENCIA_PT[status] || status;
}

export type LinhaComNomeProduto = { produto?: { nome?: string } | null };

/** Lista curta de produtos distintos para o estoque reconhecer a remessa. */
export function resumoProdutosRemessa<T extends LinhaComNomeProduto>(rows: T[], maxNomes = 2): string {
  const nomes = [...new Set(rows.map((r) => (r.produto?.nome || 'Produto').trim()).filter(Boolean))];
  if (nomes.length === 0) return '';
  const slice = nomes.slice(0, maxNomes);
  const rest = nomes.length - maxNomes;
  if (rest > 0) return `${slice.join(', ')} e mais ${rest} tipo(s)`;
  return slice.join(', ');
}

export type MetaTransferenciaRemessa = {
  origemNome: string;
  destinoNome: string;
  /** UUID do local STORE de destino (para RPC de sequência de balde na impressão). */
  destinoLocalId?: string | null;
  createdAt: string;
  status: string;
};

export function truncarTexto(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

/** Quando ainda não há meta de transferência: mostrar SEP-{1º bloco do UUID}, como na térmica 60×60. */
export function loteSepResumidoParaUi(lote: string): string {
  const t = String(lote || '').trim();
  if (!t.startsWith('SEP-')) return truncarTexto(t, 28);
  const rest = t.slice(4).trim();
  const primeiro = rest.split('-')[0]?.trim().toLowerCase() || '';
  if (primeiro.length >= 6) return `SEP-${primeiro}`;
  return truncarTexto(t, 28);
}

export function dataReferenciaRemessa(
  rows: { created_at: string }[],
  meta: MetaTransferenciaRemessa | null | undefined
): string {
  if (meta?.createdAt) return meta.createdAt;
  if (rows.length === 0) return new Date().toISOString();
  return rows.reduce((min, r) => (new Date(r.created_at) < new Date(min) ? r.created_at : min), rows[0].created_at);
}

/** Uma linha para `<option>`: data, origem → destino, quantidade. */
export function rotuloOpcaoSelectRemessa(
  rows: { created_at: string; produto?: { nome?: string } | null }[],
  meta: MetaTransferenciaRemessa | undefined
): string {
  const dataIso = dataReferenciaRemessa(rows, meta);
  const dataStr = formatarDataHoraRemessaPt(dataIso);
  const orig = meta ? truncarTexto(meta.origemNome, 20) : '…';
  const dest = meta ? truncarTexto(meta.destinoNome, 20) : '…';
  const n = rows.length;
  return `${dataStr} · ${orig} → ${dest} · ${n} etiqueta(s)`;
}
