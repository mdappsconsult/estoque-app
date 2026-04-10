import type { Usuario } from '@/types/database';

function parseLoginList(env: string | undefined): Set<string> {
  if (env == null || !String(env).trim()) return new Set();
  return new Set(
    String(env)
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * Logins da **indústria** na tela Etiquetas: **somente** impressão **Zebra 60×60** (Pi), inclusive remessa `SEP-…` — sem navegador.
 * Demais logins (estoque): apenas **navegador 60×30** (sem Pi).
 *
 * - Se `NEXT_PUBLIC_ETIQUETAS_INDUSTRIA_LOGINS` estiver definido e não vazio: usa **só** essa lista (CSV, minúsculas).
 * - Caso contrário: fallback `leonardo` (indústria).
 */
const FALLBACK_LOGINS_INDUSTRIA_ETIQUETAS = ['leonardo'] as const;

export function loginsIndustriaEtiquetasResolvidos(): Set<string> {
  const fromEnv = parseLoginList(process.env.NEXT_PUBLIC_ETIQUETAS_INDUSTRIA_LOGINS);
  if (fromEnv.size > 0) return fromEnv;
  return new Set(FALLBACK_LOGINS_INDUSTRIA_ETIQUETAS);
}

export function usuarioEtiquetasPodeImprimirZebra6060(usuario: Usuario | null | undefined): boolean {
  const login = (usuario?.login_operacional || '').trim().toLowerCase();
  if (!login) return false;
  return loginsIndustriaEtiquetasResolvidos().has(login);
}

/**
 * Mesmo login indústria (Leonardo / `NEXT_PUBLIC_ETIQUETAS_INDUSTRIA_LOGINS`): operação fábrica + viagem, **sem** consulta à tela **Estoque**.
 */
export function usuarioIndustriaSemConsultaEstoque(usuario: Usuario | null | undefined): boolean {
  return usuarioEtiquetasPodeImprimirZebra6060(usuario);
}
