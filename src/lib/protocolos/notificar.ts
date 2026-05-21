'use client';

import { getSenhaOperacionalSession, getUsuarioLogado } from '@/lib/auth';

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
 */
export function notificarProtocoloEmBackground(
  protocoloId: string,
  acao: AcaoNotificavel,
  detalhe?: string | null
): void {
  if (typeof window === 'undefined') return;
  const usuario = getUsuarioLogado();
  const senha = getSenhaOperacionalSession();
  const loginOp = usuario?.login_operacional?.trim() || '';
  if (!loginOp || !senha) {
    return;
  }
  void fetch('/api/push/disparar-protocolo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    body: JSON.stringify({
      login: loginOp,
      senha,
      protocoloId,
      acao,
      detalhe: detalhe ?? null,
    }),
  }).catch((e) => {
    console.warn('[push] disparo falhou:', e);
  });
}
