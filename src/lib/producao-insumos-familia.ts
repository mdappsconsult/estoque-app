/**
 * Produtos da família abaixo entram no select **Produção → Insumos gastos**
 * (nome em **Cadastros → Categorias**, comparação sem acento extra além das variantes listadas).
 */
const NOMES_NORMALIZADOS = new Set(['insumo industria', 'insumo indústria']);

function normalizarNomeFamilia(nome: string): string {
  return nome.trim().toLowerCase();
}

export function familiaNomeEhInsumoProducao(nomeFamilia: string | null | undefined): boolean {
  if (!nomeFamilia?.trim()) return false;
  return NOMES_NORMALIZADOS.has(normalizarNomeFamilia(nomeFamilia));
}

export function idsFamiliasInsumoProducao(familias: { id: string; nome: string }[]): Set<string> {
  const set = new Set<string>();
  for (const f of familias) {
    if (familiaNomeEhInsumoProducao(f.nome)) set.add(f.id);
  }
  return set;
}
