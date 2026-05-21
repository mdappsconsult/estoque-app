'use client';

import { getUsuarioLogado } from '@/lib/auth';

export type AcaoNotificavel =
  | 'ABRIU'
  | 'ACEITOU'
  | 'RECUSOU'
  | 'INICIOU'
  | 'CONCLUIU'
  | 'FECHOU'
  | 'COMENTOU'
  | 'MUDOU_PRIORIDADE';

/**
 * Dispara push em fire-and-forget após uma mutação bem-sucedida em protocolos.
 * Não bloqueia a UI: se a rede falhar, registra no console e segue.
 *
 * Autenticação: somente `usuarioId` do localStorage. O servidor valida que
 * esse usuário existe/ativo e tem relação com o protocolo (autor ou gestão).
 * Não depende mais da senha operacional do `sessionStorage` — antes, qualquer
 * aba reaberta perdia a senha e o disparo ficava silenciosamente em "no-op".
 */
export function notificarProtocoloEmBackground(
  protocoloId: string,
  acao: AcaoNotificavel,
  detalhe?: string | null
): void {
  if (typeof window === 'undefined') return;
  const usuario = getUsuarioLogado();
  if (!usuario?.id) {
    console.warn('[push] sem usuário logado, ignorando disparo de', acao, protocoloId);
    return;
  }
  void fetch('/api/push/disparar-protocolo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    body: JSON.stringify({
      usuarioId: usuario.id,
      protocoloId,
      acao,
      detalhe: detalhe ?? null,
    }),
  }).catch((e) => {
    console.warn('[push] disparo falhou:', e);
  });
}
