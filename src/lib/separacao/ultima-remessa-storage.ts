/**
 * Última remessa gravada após «Criar separação» em Separar por Loja.
 * Reutilizado em Etiquetas para imprimir o lote SEP-… inteiro na Zebra.
 */

export type UltimaRemessaItem = {
  id: string;
  token_qr: string;
  token_short?: string | null;
  produto_nome: string;
  produto_id: string;
  data_validade?: string | null;
};

export type UltimaRemessaImpressao = {
  lote: string;
  nomeLoja: string;
  /** UUID do local STORE de destino; mantém sequência de balde ao reimprimir. */
  destinoLocalId?: string | null;
  itens: UltimaRemessaItem[];
};

const LS_KEY = 'separarPorLoja_ultimaRemessaImpressao_v2';
const SESSION_LEGACY = 'separarPorLoja_ultimaRemessaImpressao_v1';

function validarPayload(parsed: unknown): UltimaRemessaImpressao | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const p = parsed as UltimaRemessaImpressao;
  const destOk =
    p.destinoLocalId === undefined ||
    p.destinoLocalId === null ||
    (typeof p.destinoLocalId === 'string' && p.destinoLocalId.length > 0);
  if (
    typeof p.lote === 'string' &&
    typeof p.nomeLoja === 'string' &&
    destOk &&
    Array.isArray(p.itens) &&
    p.itens.length > 0 &&
    p.itens.every(
      (i) =>
        i &&
        typeof i === 'object' &&
        typeof (i as UltimaRemessaItem).id === 'string' &&
        typeof (i as UltimaRemessaItem).token_qr === 'string' &&
        (i as UltimaRemessaItem).token_qr.length > 0 &&
        typeof (i as UltimaRemessaItem).produto_id === 'string'
    )
  ) {
    return p;
  }
  return null;
}

export function persistirUltimaRemessa(payload: UltimaRemessaImpressao): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
    sessionStorage.removeItem(SESSION_LEGACY);
  } catch {
    /* ignore */
  }
}

export function limparUltimaRemessaPersistida(): void {
  try {
    localStorage.removeItem(LS_KEY);
    sessionStorage.removeItem(SESSION_LEGACY);
  } catch {
    /* ignore */
  }
}

export function lerUltimaRemessaPersistida(): UltimaRemessaImpressao | null {
  if (typeof window === 'undefined') return null;
  try {
    const ls = localStorage.getItem(LS_KEY);
    if (ls) {
      const parsed = validarPayload(JSON.parse(ls));
      if (parsed) return parsed;
    }
    const legacy = sessionStorage.getItem(SESSION_LEGACY);
    if (legacy) {
      const parsed = validarPayload(JSON.parse(legacy));
      if (parsed) {
        persistirUltimaRemessa(parsed);
        return parsed;
      }
    }
    return null;
  } catch {
    return null;
  }
}
