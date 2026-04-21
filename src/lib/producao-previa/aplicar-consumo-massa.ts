/**
 * Simulação pura para prévia de UI: consumo por massa (g) com embalagens fechadas
 * e saldo parcial no “pacote aberto”. Não persiste dados.
 */

export type EstadoConsumoMassa = {
  id: string;
  nome: string;
  /** Gramas por embalagem de compra (ex.: 800 ou 25_000). */
  embalagemGramas: number;
  embalagensFechadas: number;
  /**
   * Gramas já “comprometidas” no pacote atualmente aberto (0 = nenhum aberto).
   * Restante no pacote aberto = embalagemGramas - saldoAcumuladoGramas.
   */
  saldoAcumuladoGramas: number;
};

export type ResultadoAplicarConsumo =
  | {
      ok: true;
      next: EstadoConsumoMassa;
      embalagensConsumidasNestePasso: number;
    }
  | {
      ok: false;
      next: EstadoConsumoMassa;
      embalagensConsumidasNestePasso: number;
      erro: string;
    };

/**
 * Soma massaGramas ao saldo; enquanto >= embalagem, consome uma embalagem fechada.
 */
export function aplicarConsumoGramas(
  estado: EstadoConsumoMassa,
  massaGramas: number
): ResultadoAplicarConsumo {
  if (!Number.isFinite(massaGramas) || massaGramas <= 0) {
    return {
      ok: false,
      next: estado,
      embalagensConsumidasNestePasso: 0,
      erro: 'Quantidade consumida deve ser maior que zero.',
    };
  }

  const { embalagemGramas } = estado;
  if (!Number.isFinite(embalagemGramas) || embalagemGramas <= 0) {
    return {
      ok: false,
      next: estado,
      embalagensConsumidasNestePasso: 0,
      erro: 'Tamanho da embalagem inválido.',
    };
  }

  const parcial = estado.saldoAcumuladoGramas + massaGramas;
  let embalagensNecessarias = 0;
  let p = parcial;
  while (p >= embalagemGramas) {
    embalagensNecessarias += 1;
    p -= embalagemGramas;
  }

  if (embalagensNecessarias > estado.embalagensFechadas) {
    return {
      ok: false,
      next: estado,
      embalagensConsumidasNestePasso: 0,
      erro: 'Estoque de embalagens fechadas insuficiente para este lançamento.',
    };
  }

  return {
    ok: true,
    next: {
      ...estado,
      embalagensFechadas: estado.embalagensFechadas - embalagensNecessarias,
      saldoAcumuladoGramas: p,
    },
    embalagensConsumidasNestePasso: embalagensNecessarias,
  };
}

export function gramasRestantesNoPacoteAberto(estado: EstadoConsumoMassa): number | null {
  if (estado.saldoAcumuladoGramas <= 0) return null;
  return Math.max(0, estado.embalagemGramas - estado.saldoAcumuladoGramas);
}

export function formatarGramasKg(gramas: number): string {
  if (gramas >= 1000 && gramas % 1000 === 0) {
    return `${gramas / 1000} kg`;
  }
  if (gramas >= 1000) {
    return `${(gramas / 1000).toFixed(3).replace(/\.?0+$/, '')} kg`;
  }
  return `${gramas} g`;
}
