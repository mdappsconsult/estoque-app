/** Média operacional vigente: a cada N baldes saem M caixas. */
export const ENVASE_MEDIA_BALDES_REF = 2;
export const ENVASE_MEDIA_CAIXAS_REF = 3;

export function calcularCaixasEsperadasEnvase(
  numBaldes: number,
  baldesRef = ENVASE_MEDIA_BALDES_REF,
  caixasRef = ENVASE_MEDIA_CAIXAS_REF
): number {
  if (!Number.isFinite(numBaldes) || numBaldes <= 0) return 0;
  if (baldesRef < 1 || caixasRef < 1) return 0;
  return Math.round((numBaldes * caixasRef) / baldesRef);
}

export function textoMediaEnvase(
  baldesRef = ENVASE_MEDIA_BALDES_REF,
  caixasRef = ENVASE_MEDIA_CAIXAS_REF
): string {
  return `${baldesRef} baldes → ${caixasRef} caixas`;
}
