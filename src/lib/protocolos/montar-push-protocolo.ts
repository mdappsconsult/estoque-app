import type { PayloadPush } from '@/lib/push/servidor';
import { PRIORIDADE_LABEL, STATUS_LABEL } from '@/lib/protocolos/ui-labels';

export type AcaoPushProtocolo =
  | 'ABRIU'
  | 'ACEITOU'
  | 'RECUSOU'
  | 'INICIOU'
  | 'CONCLUIU'
  | 'FECHOU'
  | 'COMENTOU'
  | 'MUDOU_PRIORIDADE';

export type ProtocoloPushInfo = {
  numero: number;
  titulo: string;
  prioridade: string;
  status: string;
  local_nome: string | null;
};

const MAX_TITULO = 72;
const MAX_CORPO = 178;

function truncar(texto: string, max: number): string {
  const t = texto.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

function ctx(protocolo: ProtocoloPushInfo) {
  const lugar = protocolo.local_nome || 'Administração';
  const resumo = protocolo.titulo.trim() || '(sem título)';
  const num = `#${protocolo.numero}`;
  return { num, lugar, resumo };
}

function tituloPedido(numero: number, evento: string, lugar: string): string {
  return truncar(`Pedido #${numero} · ${evento} · ${lugar}`, MAX_TITULO);
}

function urgenciaAposSeta(detalhe: string | null): string | null {
  if (!detalhe) return null;
  const partes = detalhe.split('→').map((s) => s.trim()).filter(Boolean);
  return partes.length > 1 ? partes[partes.length - 1]! : detalhe;
}

/** Monta título/corpo da push: pedido, loja e o que mudou. */
export function montarPushProtocolo(
  acao: AcaoPushProtocolo,
  protocolo: ProtocoloPushInfo,
  autorAcaoNome: string,
  detalhe: string | null
): PayloadPush {
  const { num, lugar, resumo } = ctx(protocolo);
  const quem = autorAcaoNome.trim() || 'Alguém';
  const tagBase = `protocolo-${protocolo.numero}`;

  if (acao === 'ABRIU') {
    return {
      titulo: tituloPedido(protocolo.numero, 'novo pedido', lugar),
      corpo: truncar(`${quem} abriu ${num}: ${resumo}`, MAX_CORPO),
      tag: `${tagBase}-aberto`,
    };
  }
  if (acao === 'ACEITOU') {
    return {
      titulo: tituloPedido(protocolo.numero, 'aceito', lugar),
      corpo: truncar(`${quem} aceitou ${num} — ${resumo}`, MAX_CORPO),
      tag: tagBase,
    };
  }
  if (acao === 'RECUSOU') {
    return {
      titulo: tituloPedido(protocolo.numero, 'recusado', lugar),
      corpo: truncar(
        detalhe
          ? `${quem} recusou ${num} (${detalhe}) — ${resumo}`
          : `${quem} recusou ${num} — ${resumo}`,
        MAX_CORPO
      ),
      tag: tagBase,
    };
  }
  if (acao === 'INICIOU') {
    return {
      titulo: tituloPedido(protocolo.numero, 'em execução', lugar),
      corpo: truncar(
        detalhe
          ? `${quem} está resolvendo ${num} com ${detalhe} — ${resumo}`
          : `${quem} iniciou ${num} — ${resumo}`,
        MAX_CORPO
      ),
      tag: tagBase,
    };
  }
  if (acao === 'CONCLUIU') {
    return {
      titulo: tituloPedido(protocolo.numero, 'pronto, conferir', lugar),
      corpo: truncar(`${quem} marcou ${num} pronto — ${resumo}`, MAX_CORPO),
      tag: tagBase,
    };
  }
  if (acao === 'FECHOU') {
    return {
      titulo: tituloPedido(protocolo.numero, 'encerrado', lugar),
      corpo: truncar(
        detalhe
          ? `${quem} encerrou ${num} — ${detalhe} · ${resumo}`
          : `${quem} encerrou ${num} — ${resumo}`,
        MAX_CORPO
      ),
      tag: tagBase,
    };
  }
  if (acao === 'COMENTOU') {
    return {
      titulo: tituloPedido(protocolo.numero, 'novo comentário', lugar),
      corpo: truncar(
        detalhe ? `${quem} em ${num}: ${detalhe}` : `${quem} comentou em ${num} — ${resumo}`,
        MAX_CORPO
      ),
      tag: `${tagBase}-comentario`,
    };
  }
  if (acao === 'MUDOU_PRIORIDADE') {
    const urgencia = urgenciaAposSeta(detalhe) || 'urgência alterada';
    return {
      titulo: tituloPedido(protocolo.numero, urgencia, lugar),
      corpo: truncar(
        detalhe
          ? `${quem} mudou urgência de ${num} (${detalhe}) — ${resumo}`
          : `${quem} mudou urgência de ${num} — ${resumo}`,
        MAX_CORPO
      ),
      tag: tagBase,
    };
  }

  const status =
    STATUS_LABEL[protocolo.status as keyof typeof STATUS_LABEL] || protocolo.status;
  const prioridade =
    PRIORIDADE_LABEL[protocolo.prioridade as keyof typeof PRIORIDADE_LABEL] ||
    protocolo.prioridade;
  return {
    titulo: tituloPedido(protocolo.numero, status, lugar),
    corpo: truncar(`${status} · ${prioridade} — ${resumo}`, MAX_CORPO),
    tag: tagBase,
  };
}
