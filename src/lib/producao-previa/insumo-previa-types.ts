import type { EstadoConsumoMassa } from '@/lib/producao-previa/aplicar-consumo-massa';

/** Insumo na prévia: estado de estoque + regras de cadastro (demo, só memória). */
export type InsumoPrevia = EstadoConsumoMassa & {
  /**
   * Gramas por dose na receita. Se **> 0**, o lançamento pede «doses» (inteiro).
   * Se **0**, o lançamento pede **kg** neste lote (ex.: base em saco).
   */
  gramasPorDose: number;
};

export function novoIdInsumoPrevia(): string {
  return typeof crypto !== 'undefined' ? crypto.randomUUID() : `ins-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** IDs estáveis para o exemplo (evita dessincronizar estado na primeira carga). */
export function exemploInsumosPrevia(): InsumoPrevia[] {
  return [
    {
      id: 'previa-demo-guarana',
      nome: 'Aroma Guaraná',
      embalagemGramas: 800,
      embalagensFechadas: 5,
      saldoAcumuladoGramas: 0,
      gramasPorDose: 350,
    },
    {
      id: 'previa-demo-base',
      nome: 'Base cupuaçu (saco)',
      embalagemGramas: 25_000,
      embalagensFechadas: 4,
      saldoAcumuladoGramas: 0,
      gramasPorDose: 0,
    },
  ];
}

export function mapLancamentoDefaults(list: InsumoPrevia[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (const i of list) {
    m[i.id] = i.gramasPorDose > 0 ? '2' : '13';
  }
  return m;
}
