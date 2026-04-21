import type { Produto } from '@/types/database';

export function normalizarEan(s: string | null | undefined): string {
  return String(s || '').replace(/\D/g, '');
}

/**
 * Sugere produto por EAN cadastrado ou por nome contido na descrição da NF.
 */
export function sugerirProdutoId(produtos: Produto[], ean: string | null, descricao: string): string {
  const e = normalizarEan(ean);
  if (e.length >= 8) {
    const row = produtos.find((p) => normalizarEan(p.codigo_barras) === e);
    if (row) return row.id;
  }
  const d = descricao.trim().toLowerCase();
  if (!d) return '';
  for (const p of produtos) {
    const n = p.nome.trim().toLowerCase();
    if (!n) continue;
    if (d.includes(n)) return p.id;
    const prefix = d.slice(0, Math.min(24, d.length));
    if (prefix.length >= 6 && n.includes(prefix)) return p.id;
  }
  return '';
}
