import type { Local } from '@/types/database';

export type MatrizOrigemEtiquetas = 'industria' | 'estoque';

const STORAGE_MATRIZ_ETIQUETAS = 'etiquetas-matriz-origem';

/** Warehouses cadastrados (matrizes). */
export function warehousesMatrizFromLocais(locais: Local[]): Local[] {
  return locais.filter((l) => l.tipo === 'WAREHOUSE' && l.status === 'ativo');
}

/**
 * Identifica os UUIDs de «Indústria» e «Estoque» pelos nomes em `locais` (operacional Açaí Kim).
 * Prioriza match exato (case insensitive), depois substring.
 */
export function idsMatrizEtiquetasPorNome(locais: Local[]): {
  industriaId: string | null;
  estoqueId: string | null;
} {
  const wh = warehousesMatrizFromLocais(locais);
  if (wh.length === 0) return { industriaId: null, estoqueId: null };

  const trim = (s: string) => s.trim();
  const lower = (s: string) => trim(s).toLowerCase();
  const semAcento = (s: string) =>
    lower(s)
      .normalize('NFD')
      .replace(/\p{M}/gu, '');

  let industriaId: string | null = null;
  let estoqueId: string | null = null;

  const exatoInd = wh.find((l) => semAcento(l.nome) === 'industria');
  const exatoEst = wh.find((l) => semAcento(l.nome) === 'estoque');
  if (exatoInd) industriaId = exatoInd.id;
  if (exatoEst) estoqueId = exatoEst.id;

  if (!industriaId) {
    const hit = wh.find((l) => {
      const n = semAcento(l.nome);
      return n.includes('industria') && !n.includes('estoque');
    });
    industriaId = hit?.id ?? null;
  }
  if (!industriaId) {
    const hit = wh.find((l) => /indústria|industria/i.test(trim(l.nome)));
    industriaId = hit?.id ?? null;
  }

  if (!estoqueId) {
    const hit = wh.find((l) => {
      const n = semAcento(l.nome);
      return (n === 'estoque' || n.includes('estoque')) && industriaId !== l.id;
    });
    estoqueId = hit?.id ?? null;
  }

  if (industriaId && estoqueId && industriaId === estoqueId) {
    estoqueId = wh.find((l) => l.id !== industriaId)?.id ?? null;
  }

  return { industriaId, estoqueId };
}

export function origemIdParaMatrizEtiquetas(
  escolha: MatrizOrigemEtiquetas,
  ids: { industriaId: string | null; estoqueId: string | null }
): string | undefined {
  const raw = escolha === 'industria' ? ids.industriaId : ids.estoqueId;
  const id = raw?.trim();
  return id || undefined;
}

export function lerMatrizEtiquetasSession(): MatrizOrigemEtiquetas | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_MATRIZ_ETIQUETAS);
    if (raw === 'industria' || raw === 'estoque') return raw;
  } catch {
    /* ignore */
  }
  return null;
}

export function gravarMatrizEtiquetasSession(escolha: MatrizOrigemEtiquetas): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_MATRIZ_ETIQUETAS, escolha);
  } catch {
    /* ignore */
  }
}
