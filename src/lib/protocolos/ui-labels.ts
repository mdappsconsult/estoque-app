import type { Prioridade, StatusProtocolo } from '@/lib/services/protocolos';

export const STATUS_LABEL: Record<StatusProtocolo, string> = {
  ABERTO: 'Aguardando',
  ACEITO: 'Aceito',
  EM_EXECUCAO: 'Estão cuidando',
  CONCLUIDO: 'Pronto, conferir',
  FECHADO: 'Encerrado',
  RECUSADO: 'Não vai ser feito',
};

/** Classes Tailwind para chip de status. */
export const STATUS_CHIP: Record<StatusProtocolo, string> = {
  ABERTO: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  ACEITO: 'bg-blue-100 text-blue-700 border-blue-200',
  EM_EXECUCAO: 'bg-purple-100 text-purple-700 border-purple-200',
  CONCLUIDO: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  FECHADO: 'bg-green-100 text-green-700 border-green-200',
  RECUSADO: 'bg-gray-200 text-gray-600 border-gray-300',
};

export const PRIORIDADE_LABEL: Record<Prioridade, string> = {
  BAIXA: 'Pode esperar',
  MEDIA: 'Normal',
  ALTA: 'Importante',
  URGENTE: 'Urgente!',
};

export const PRIORIDADE_LABEL_CURTA: Record<Prioridade, string> = {
  BAIXA: 'Baixa',
  MEDIA: 'Normal',
  ALTA: 'Alta',
  URGENTE: 'Urgente',
};

/** Cor da bolinha "semáforo" no card. */
export const PRIORIDADE_BOLA: Record<Prioridade, string> = {
  BAIXA: 'bg-green-500',
  MEDIA: 'bg-blue-500',
  ALTA: 'bg-orange-500',
  URGENTE: 'bg-red-600',
};

/** Botão grande no formulário de abrir. */
export const PRIORIDADE_BOTAO_FORM: Record<Prioridade, string> = {
  BAIXA: 'bg-green-50 border-green-300 text-green-800',
  MEDIA: 'bg-blue-50 border-blue-300 text-blue-800',
  ALTA: 'bg-orange-50 border-orange-300 text-orange-800',
  URGENTE: 'bg-red-50 border-red-400 text-red-800',
};

export const PRIORIDADE_BOTAO_FORM_ATIVO: Record<Prioridade, string> = {
  BAIXA: 'bg-green-600 border-green-700 text-white',
  MEDIA: 'bg-blue-600 border-blue-700 text-white',
  ALTA: 'bg-orange-600 border-orange-700 text-white',
  URGENTE: 'bg-red-600 border-red-700 text-white',
};

/** Texto curto "abriu há X" no card. */
export function formatarTempoDesde(iso: string, agora = Date.now()): string {
  const ms = agora - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} d`;
  const mes = Math.floor(d / 30);
  if (mes < 12) return `${mes} mês`;
  return `${Math.floor(mes / 12)} ano`;
}

/** Formata data em pt-BR com sufixo "hoje" / "ontem" quando aplicável. */
export function formatarDataAmigavel(iso: string, agora = new Date()): string {
  const data = new Date(iso);
  const hoje = new Date(agora);
  hoje.setHours(0, 0, 0, 0);
  const dataDia = new Date(data);
  dataDia.setHours(0, 0, 0, 0);
  const diff = Math.round((hoje.getTime() - dataDia.getTime()) / (24 * 60 * 60 * 1000));
  const hora = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (diff === 0) return `${hora} hoje`;
  if (diff === 1) return `${hora} ontem`;
  const ddmm = data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return `${ddmm} ${hora}`;
}
