import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { PerfilUsuario, Usuario } from '@/types/database';
import { registrarAuditoria } from './auditoria';
import { notificarProtocoloEmBackground } from '@/lib/protocolos/notificar';

// ----------------------------------------------------------------------------
// Tipos
// ----------------------------------------------------------------------------

export type Prioridade = 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE';
export type StatusProtocolo =
  | 'ABERTO'
  | 'ACEITO'
  | 'EM_EXECUCAO'
  | 'CONCLUIDO'
  | 'FECHADO'
  | 'RECUSADO';

export const PRIORIDADES: Prioridade[] = ['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'];

export interface Protocolo {
  id: string;
  numero: number;
  titulo: string;
  descricao: string;
  local_id: string | null;
  prioridade: Prioridade;
  status: StatusProtocolo;
  responsavel_externo: string | null;
  aberto_por: string;
  gerente_id: string | null;
  motivo_recusa: string | null;
  observacao_fechamento: string | null;
  /** DEPRECATED: registros antigos podem ter só esta coluna. Use `foto_paths`. */
  foto_path: string | null;
  /** Até 3 fotos por protocolo (paths no bucket privado `protocolos-fotos`). */
  foto_paths: string[];
  reaberto_de: string | null;
  created_at: string;
  aceito_em: string | null;
  iniciado_em: string | null;
  concluido_em: string | null;
  fechado_em: string | null;
}

export interface ProtocoloComEmbed extends Protocolo {
  autor?: { id: string; nome: string } | null;
  gerente?: { id: string; nome: string } | null;
  local?: { id: string; nome: string; tipo: string } | null;
}

export interface ProtocoloComentario {
  id: string;
  protocolo_id: string;
  usuario_id: string | null;
  texto: string;
  created_at: string;
}

export interface ProtocoloComentarioComAutor extends ProtocoloComentario {
  autor?: { id: string; nome: string } | null;
}

export interface PrazoConfig {
  horas_para_aceitar: number;
  dias_para_fechar: number;
}

export type PrazosConfigMap = Record<Prioridade, PrazoConfig>;

export const PRAZOS_DEFAULT: PrazosConfigMap = {
  URGENTE: { horas_para_aceitar: 1, dias_para_fechar: 1 },
  ALTA: { horas_para_aceitar: 4, dias_para_fechar: 3 },
  MEDIA: { horas_para_aceitar: 12, dias_para_fechar: 7 },
  BAIXA: { horas_para_aceitar: 24, dias_para_fechar: 15 },
};

const PERFIS_OPERADORES = new Set<PerfilUsuario>([
  'OPERATOR_STORE',
  'OPERATOR_WAREHOUSE',
  'OPERATOR_WAREHOUSE_DRIVER',
]);

const PERFIS_GESTAO = new Set<PerfilUsuario>(['MANAGER', 'ADMIN_MASTER']);

export function eOperador(perfil: PerfilUsuario): boolean {
  return PERFIS_OPERADORES.has(perfil);
}

export function eGestao(perfil: PerfilUsuario): boolean {
  return PERFIS_GESTAO.has(perfil);
}

const SELECT_LISTA = `
  id, numero, titulo, descricao, local_id, prioridade, status, responsavel_externo,
  aberto_por, gerente_id, motivo_recusa, observacao_fechamento, foto_path, foto_paths, reaberto_de,
  created_at, aceito_em, iniciado_em, concluido_em, fechado_em,
  autor:usuarios!aberto_por(id, nome),
  gerente:usuarios!gerente_id(id, nome),
  local:locais(id, nome, tipo)
`;

// ----------------------------------------------------------------------------
// CRUD — leitura
// ----------------------------------------------------------------------------

export async function listarMeusProtocolos(usuarioId: string): Promise<ProtocoloComEmbed[]> {
  const { data, error } = await supabase
    .from('protocolos')
    .select(SELECT_LISTA)
    .eq('aberto_por', usuarioId)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data || []) as unknown as ProtocoloComEmbed[];
}

export interface ListarGestaoOpts {
  status?: StatusProtocolo | StatusProtocolo[] | null;
  prioridade?: Prioridade | null;
  localId?: string | null;
  busca?: string;
  apenasMeus?: boolean;
  usuarioId?: string;
  limite?: number;
}

export async function listarProtocolosGestao(opts: ListarGestaoOpts): Promise<ProtocoloComEmbed[]> {
  const lim = Math.min(Math.max(opts.limite ?? 800, 1), 2000);
  /* eslint-disable @typescript-eslint/no-explicit-any -- builder PostgREST após .select() */
  let q: any = supabase.from('protocolos').select(SELECT_LISTA);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  if (Array.isArray(opts.status) && opts.status.length > 0) {
    q = q.in('status', opts.status);
  } else if (typeof opts.status === 'string') {
    q = q.eq('status', opts.status);
  }
  if (opts.prioridade) q = q.eq('prioridade', opts.prioridade);
  if (opts.localId) q = q.eq('local_id', opts.localId);
  if (opts.apenasMeus && opts.usuarioId) q = q.eq('aberto_por', opts.usuarioId);

  q = q.order('created_at', { ascending: false }).limit(lim);

  const { data, error } = await q;
  if (error) throw error;
  let rows = (data || []) as unknown as ProtocoloComEmbed[];

  const busca = (opts.busca || '').trim().toLowerCase();
  if (busca) {
    rows = rows.filter((r) => {
      const numeroStr = `#${r.numero}`;
      return (
        r.titulo.toLowerCase().includes(busca) ||
        r.descricao.toLowerCase().includes(busca) ||
        numeroStr.includes(busca) ||
        (r.responsavel_externo || '').toLowerCase().includes(busca)
      );
    });
  }
  return rows;
}

export async function buscarProtocolo(id: string): Promise<ProtocoloComEmbed | null> {
  const { data, error } = await supabase
    .from('protocolos')
    .select(SELECT_LISTA)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as ProtocoloComEmbed) || null;
}

export async function contarProtocolosBadge(usuario: Usuario): Promise<number> {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let q: any = supabase.from('protocolos').select('id', { count: 'exact', head: true });
  /* eslint-enable @typescript-eslint/no-explicit-any */

  if (eGestao(usuario.perfil)) {
    q = q.in('status', ['ABERTO', 'ACEITO', 'EM_EXECUCAO', 'CONCLUIDO']);
  } else if (eOperador(usuario.perfil)) {
    q = q.eq('aberto_por', usuario.id).not('status', 'in', '(FECHADO,RECUSADO)');
  } else {
    return 0;
  }
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

// ----------------------------------------------------------------------------
// Mutações
// ----------------------------------------------------------------------------

export interface AbrirProtocoloInput {
  titulo: string;
  descricao: string;
  /** Se vier de operador é ignorado e gravado como MEDIA — só a secretaria define urgência. */
  prioridade?: Prioridade;
  local_id: string | null;
  /** Até 3 fotos. Se vier `foto_path` legado, ele é movido para a primeira posição. */
  foto_paths?: string[] | null;
  /** DEPRECATED: use `foto_paths`. Mantido só pra não quebrar chamadas antigas. */
  foto_path?: string | null;
  aberto_por: string;
  perfil: PerfilUsuario;
  reaberto_de?: string | null;
}

const MAX_FOTOS_PROTOCOLO = 3;

/** Normaliza qualquer combinação de `foto_paths` + `foto_path` (legado) em um array com no máximo 3. */
function resolverFotoPaths(input: AbrirProtocoloInput): string[] {
  const arr = (input.foto_paths ?? []).filter((p): p is string => !!p && typeof p === 'string');
  if (arr.length === 0 && input.foto_path) arr.push(input.foto_path);
  if (arr.length > MAX_FOTOS_PROTOCOLO) {
    throw new Error(`Máximo de ${MAX_FOTOS_PROTOCOLO} fotos por pedido.`);
  }
  return arr;
}

export async function abrirProtocolo(input: AbrirProtocoloInput): Promise<Protocolo> {
  const titulo = input.titulo.trim();
  const descricao = input.descricao.trim();
  if (!titulo) throw new Error('Faltou contar o que aconteceu (resumo curto).');
  if (titulo.length > 80) throw new Error('Resumo curto deve ter no máximo 80 caracteres.');
  if (!descricao) throw new Error('Faltou descrever os detalhes do que aconteceu.');

  const fotoPaths = resolverFotoPaths(input);

  const ehGestao = eGestao(input.perfil);
  let prioridadeFinal: Prioridade = 'MEDIA';
  if (ehGestao && input.prioridade) {
    if (!PRIORIDADES.includes(input.prioridade)) {
      throw new Error('Prioridade inválida.');
    }
    prioridadeFinal = input.prioridade;
  }

  let localFinal: string | null = input.local_id ?? null;
  if (eOperador(input.perfil)) {
    const { data: u, error: eU } = await supabase
      .from('usuarios')
      .select('local_padrao_id')
      .eq('id', input.aberto_por)
      .maybeSingle();
    if (eU) throw eU;
    localFinal = (u?.local_padrao_id as string | null) ?? null;
  }

  const { data, error } = await supabase
    .from('protocolos')
    .insert({
      titulo,
      descricao,
      prioridade: prioridadeFinal,
      local_id: localFinal,
      foto_path: fotoPaths[0] ?? null,
      foto_paths: fotoPaths,
      aberto_por: input.aberto_por,
      reaberto_de: input.reaberto_de ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;

  await registrarAuditoria({
    usuario_id: input.aberto_por,
    local_id: localFinal,
    acao: 'ABRIR_PROTOCOLO',
    detalhes: {
      protocolo_id: data.id,
      numero: data.numero,
      prioridade: prioridadeFinal,
      por_gestao: ehGestao,
      titulo,
      qtd_fotos: fotoPaths.length,
    },
  });

  notificarProtocoloEmBackground(data.id, 'ABRIU');

  return data as Protocolo;
}

export async function aceitarProtocolo(id: string, gerenteId: string): Promise<void> {
  const { data, error } = await supabase
    .from('protocolos')
    .update({
      status: 'ACEITO',
      gerente_id: gerenteId,
      aceito_em: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'ABERTO')
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error('Este pedido não pode ser aceito agora (alguém pode já ter respondido).');
  }
  await registrarAuditoria({
    usuario_id: gerenteId,
    acao: 'ACEITAR_PROTOCOLO',
    detalhes: { protocolo_id: id },
  });
  notificarProtocoloEmBackground(id, 'ACEITOU');
}

export async function recusarProtocolo(
  id: string,
  gerenteId: string,
  motivo: string,
  comentario: string
): Promise<void> {
  const motivoT = motivo.trim();
  const comentarioT = comentario.trim();
  if (!motivoT) throw new Error('Informe um motivo curto para a recusa.');
  if (!comentarioT) {
    throw new Error('Escreva uma explicação para quem abriu o pedido entender.');
  }

  const { data, error } = await supabase
    .from('protocolos')
    .update({
      status: 'RECUSADO',
      gerente_id: gerenteId,
      motivo_recusa: motivoT,
      fechado_em: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'ABERTO')
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error('Este pedido não pode mais ser recusado (já foi respondido).');
  }

  await supabase.from('protocolo_comentarios').insert({
    protocolo_id: id,
    usuario_id: gerenteId,
    texto: comentarioT,
  });

  await registrarAuditoria({
    usuario_id: gerenteId,
    acao: 'RECUSAR_PROTOCOLO',
    detalhes: { protocolo_id: id, motivo: motivoT },
  });
  notificarProtocoloEmBackground(id, 'RECUSOU', motivoT);
}

export async function iniciarExecucao(
  id: string,
  gerenteId: string,
  responsavelExterno: string
): Promise<void> {
  const respT = responsavelExterno.trim();
  if (!respT) {
    throw new Error('Informe quem vai cuidar (nome do técnico ou responsável).');
  }
  const { data, error } = await supabase
    .from('protocolos')
    .update({
      status: 'EM_EXECUCAO',
      gerente_id: gerenteId,
      responsavel_externo: respT,
      iniciado_em: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'ACEITO')
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error('Este pedido não está em condição de iniciar execução.');
  }
  await registrarAuditoria({
    usuario_id: gerenteId,
    acao: 'INICIAR_PROTOCOLO',
    detalhes: { protocolo_id: id, responsavel: respT },
  });
  notificarProtocoloEmBackground(id, 'INICIOU', respT);
}

export async function marcarConcluido(
  id: string,
  usuarioId: string,
  perfil: PerfilUsuario
): Promise<void> {
  const { data: atual, error: eGet } = await supabase
    .from('protocolos')
    .select('status, aberto_por')
    .eq('id', id)
    .maybeSingle();
  if (eGet) throw eGet;
  if (!atual) throw new Error('Pedido não encontrado.');
  if (atual.status !== 'EM_EXECUCAO') {
    throw new Error('Só dá para marcar pronto quando o pedido está em execução.');
  }
  const ehGestao = eGestao(perfil);
  const ehAutor = atual.aberto_por === usuarioId;
  if (!ehGestao && !ehAutor) {
    throw new Error('Só quem abriu o pedido ou a secretaria pode marcar pronto.');
  }

  const { error: eUp } = await supabase
    .from('protocolos')
    .update({
      status: 'CONCLUIDO',
      concluido_em: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'EM_EXECUCAO');
  if (eUp) throw eUp;
  await registrarAuditoria({
    usuario_id: usuarioId,
    acao: 'MARCAR_CONCLUIDO_PROTOCOLO',
    detalhes: { protocolo_id: id, por_autor: ehAutor },
  });
  notificarProtocoloEmBackground(id, 'CONCLUIU');
}

export async function alterarPrioridade(
  protocoloId: string,
  novaPrioridade: Prioridade,
  usuarioId: string,
  perfil: PerfilUsuario
): Promise<void> {
  if (!PRIORIDADES.includes(novaPrioridade)) {
    throw new Error('Prioridade inválida.');
  }
  if (!eGestao(perfil)) {
    throw new Error('Só a secretaria/administrador pode mudar a urgência.');
  }
  const { data: atual, error: eGet } = await supabase
    .from('protocolos')
    .select('prioridade, status')
    .eq('id', protocoloId)
    .maybeSingle();
  if (eGet) throw eGet;
  if (!atual) throw new Error('Pedido não encontrado.');
  if (atual.status === 'FECHADO' || atual.status === 'RECUSADO') {
    throw new Error('Pedido já encerrado — não dá para mudar a urgência.');
  }
  const anterior = atual.prioridade as Prioridade;
  if (anterior === novaPrioridade) return;

  const { error: eUp } = await supabase
    .from('protocolos')
    .update({ prioridade: novaPrioridade })
    .eq('id', protocoloId);
  if (eUp) throw eUp;

  await registrarAuditoria({
    usuario_id: usuarioId,
    acao: 'ALTERAR_PRIORIDADE_PROTOCOLO',
    detalhes: { protocolo_id: protocoloId, de: anterior, para: novaPrioridade },
  });
  // detalhe = label da nova prioridade (server reaproveita no payload).
  const labels: Record<Prioridade, string> = {
    BAIXA: 'Pode esperar',
    MEDIA: 'Normal',
    ALTA: 'Importante',
    URGENTE: 'Urgente!',
  };
  notificarProtocoloEmBackground(protocoloId, 'MUDOU_PRIORIDADE', labels[novaPrioridade]);
}

export async function fecharProtocolo(
  id: string,
  gerenteId: string,
  observacao: string
): Promise<void> {
  const obs = observacao.trim();
  const { data, error } = await supabase
    .from('protocolos')
    .update({
      status: 'FECHADO',
      gerente_id: gerenteId,
      observacao_fechamento: obs || null,
      fechado_em: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'CONCLUIDO')
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error('Este pedido não pode ser encerrado agora.');
  }
  await registrarAuditoria({
    usuario_id: gerenteId,
    acao: 'FECHAR_PROTOCOLO',
    detalhes: { protocolo_id: id, observacao: obs || null },
  });
  notificarProtocoloEmBackground(id, 'FECHOU');
}

export async function adicionarComentario(
  protocoloId: string,
  usuarioId: string,
  texto: string
): Promise<void> {
  const t = texto.trim();
  if (!t) throw new Error('Escreva alguma coisa antes de enviar.');

  const { data: p, error: eP } = await supabase
    .from('protocolos')
    .select('status')
    .eq('id', protocoloId)
    .maybeSingle();
  if (eP) throw eP;
  if (!p) throw new Error('Pedido não encontrado.');
  if (p.status === 'FECHADO' || p.status === 'RECUSADO') {
    throw new Error('Este pedido já foi encerrado — não dá mais para comentar.');
  }

  const { error } = await supabase.from('protocolo_comentarios').insert({
    protocolo_id: protocoloId,
    usuario_id: usuarioId,
    texto: t,
  });
  if (error) throw error;
  await registrarAuditoria({
    usuario_id: usuarioId,
    acao: 'COMENTAR_PROTOCOLO',
    detalhes: { protocolo_id: protocoloId },
  });
  const previa = t.length > 120 ? t.slice(0, 117).trimEnd() + '…' : t;
  notificarProtocoloEmBackground(protocoloId, 'COMENTOU', previa);
}

// ----------------------------------------------------------------------------
// Prazos
// ----------------------------------------------------------------------------

export async function listarPrazosConfig(): Promise<PrazosConfigMap> {
  const { data, error } = await supabase
    .from('protocolo_prazos_config')
    .select('prioridade, horas_para_aceitar, dias_para_fechar');
  if (error) throw error;
  const out: PrazosConfigMap = { ...PRAZOS_DEFAULT };
  for (const r of data || []) {
    const p = r.prioridade as Prioridade;
    if (PRIORIDADES.includes(p)) {
      out[p] = {
        horas_para_aceitar: Number(r.horas_para_aceitar),
        dias_para_fechar: Number(r.dias_para_fechar),
      };
    }
  }
  return out;
}

export async function salvarPrazoConfig(
  prioridade: Prioridade,
  prazo: PrazoConfig,
  usuarioId: string
): Promise<void> {
  if (!PRIORIDADES.includes(prioridade)) throw new Error('Prioridade inválida.');
  if (!Number.isInteger(prazo.horas_para_aceitar) || prazo.horas_para_aceitar <= 0) {
    throw new Error('Horas para aceitar deve ser um número maior que zero.');
  }
  if (!Number.isInteger(prazo.dias_para_fechar) || prazo.dias_para_fechar <= 0) {
    throw new Error('Dias para fechar deve ser um número maior que zero.');
  }

  const { data: atual } = await supabase
    .from('protocolo_prazos_config')
    .select('horas_para_aceitar, dias_para_fechar')
    .eq('prioridade', prioridade)
    .maybeSingle();

  const { error } = await supabase
    .from('protocolo_prazos_config')
    .upsert(
      {
        prioridade,
        horas_para_aceitar: prazo.horas_para_aceitar,
        dias_para_fechar: prazo.dias_para_fechar,
        atualizado_em: new Date().toISOString(),
        atualizado_por: usuarioId,
      },
      { onConflict: 'prioridade' }
    );
  if (error) throw error;

  await registrarAuditoria({
    usuario_id: usuarioId,
    acao: 'EDITAR_PRAZO_PROTOCOLO',
    detalhes: {
      prioridade,
      anterior: atual ?? null,
      novo: prazo,
    },
  });
}

// ----------------------------------------------------------------------------
// Helpers de atraso (puros)
// ----------------------------------------------------------------------------

function horasDecorridas(desdeIso: string, ateMs = Date.now()): number {
  return (ateMs - new Date(desdeIso).getTime()) / (1000 * 60 * 60);
}

function diasDecorridos(desdeIso: string, ateMs = Date.now()): number {
  return (ateMs - new Date(desdeIso).getTime()) / (1000 * 60 * 60 * 24);
}

export function eAtrasadoParaAceitar(p: Protocolo, prazos: PrazosConfigMap): boolean {
  if (p.status !== 'ABERTO') return false;
  const limite = prazos[p.prioridade]?.horas_para_aceitar;
  if (!limite) return false;
  return horasDecorridas(p.created_at) > limite;
}

export function eAtrasadoParaFechar(p: Protocolo, prazos: PrazosConfigMap): boolean {
  if (p.status === 'FECHADO' || p.status === 'RECUSADO') return false;
  const limite = prazos[p.prioridade]?.dias_para_fechar;
  if (!limite) return false;
  return diasDecorridos(p.created_at) > limite;
}

export function eAtrasado(p: Protocolo, prazos: PrazosConfigMap): boolean {
  return eAtrasadoParaAceitar(p, prazos) || eAtrasadoParaFechar(p, prazos);
}

// ----------------------------------------------------------------------------
// Timeline (auditoria + comentários, ordenados)
// ----------------------------------------------------------------------------

export type TimelineEntradaTipo =
  | 'ABRIU'
  | 'ACEITOU'
  | 'RECUSOU'
  | 'INICIOU'
  | 'CONCLUIU'
  | 'FECHOU'
  | 'COMENTOU'
  | 'MUDOU_PRIORIDADE';

export interface TimelineEntrada {
  id: string;
  tipo: TimelineEntradaTipo;
  em: string;
  usuario_id: string | null;
  usuario_nome: string | null;
  texto: string | null;
  detalhes?: Record<string, unknown> | null;
}

const ACAO_PARA_TIPO: Record<string, TimelineEntradaTipo> = {
  ABRIR_PROTOCOLO: 'ABRIU',
  ACEITAR_PROTOCOLO: 'ACEITOU',
  RECUSAR_PROTOCOLO: 'RECUSOU',
  INICIAR_PROTOCOLO: 'INICIOU',
  MARCAR_CONCLUIDO_PROTOCOLO: 'CONCLUIU',
  FECHAR_PROTOCOLO: 'FECHOU',
  ALTERAR_PRIORIDADE_PROTOCOLO: 'MUDOU_PRIORIDADE',
};

interface AuditoriaRow {
  id: string;
  created_at: string;
  usuario_id: string | null;
  acao: string;
  detalhes: Record<string, unknown> | null;
  usuario?: { id: string; nome: string } | null;
}

interface ComentarioRow {
  id: string;
  created_at: string;
  texto: string;
  usuario_id: string | null;
  usuario?: { id: string; nome: string } | null;
}

export async function listarTimelineProtocolo(
  protocoloId: string
): Promise<TimelineEntrada[]> {
  const [{ data: aud, error: eAud }, { data: coms, error: eCom }] = await Promise.all([
    supabase
      .from('auditoria')
      .select('id, created_at, usuario_id, acao, detalhes, usuario:usuarios(id, nome)')
      .like('acao', '%PROTOCOLO%')
      .filter('detalhes->>protocolo_id', 'eq', protocoloId)
      .order('created_at', { ascending: true })
      .limit(500),
    supabase
      .from('protocolo_comentarios')
      .select('id, created_at, texto, usuario_id, usuario:usuarios!usuario_id(id, nome)')
      .eq('protocolo_id', protocoloId)
      .order('created_at', { ascending: true })
      .limit(500),
  ]);
  if (eAud) throw eAud;
  if (eCom) throw eCom;

  const audRows = (aud || []) as unknown as AuditoriaRow[];
  const comRows = (coms || []) as unknown as ComentarioRow[];

  const entradas: TimelineEntrada[] = [];
  for (const r of audRows) {
    const tipo = ACAO_PARA_TIPO[r.acao];
    if (!tipo) continue;
    entradas.push({
      id: `aud:${r.id}`,
      tipo,
      em: r.created_at,
      usuario_id: r.usuario_id,
      usuario_nome: r.usuario?.nome ?? null,
      texto: null,
      detalhes: r.detalhes ?? null,
    });
  }
  for (const r of comRows) {
    entradas.push({
      id: `com:${r.id}`,
      tipo: 'COMENTOU',
      em: r.created_at,
      usuario_id: r.usuario_id,
      usuario_nome: r.usuario?.nome ?? null,
      texto: r.texto,
    });
  }
  entradas.sort((a, b) => new Date(a.em).getTime() - new Date(b.em).getTime());
  return entradas;
}

// ----------------------------------------------------------------------------
// Versões com client injetado (uso em rotas server-side / service role)
// ----------------------------------------------------------------------------

export async function abrirProtocoloComClient(
  client: SupabaseClient,
  input: AbrirProtocoloInput
): Promise<Protocolo> {
  const titulo = input.titulo.trim();
  const descricao = input.descricao.trim();
  if (!titulo || titulo.length > 80) throw new Error('Resumo curto inválido.');
  if (!descricao) throw new Error('Detalhes obrigatórios.');

  const fotoPaths = resolverFotoPaths(input);

  const ehGestao = eGestao(input.perfil);
  let prioridadeFinal: Prioridade = 'MEDIA';
  if (ehGestao && input.prioridade) {
    if (!PRIORIDADES.includes(input.prioridade)) {
      throw new Error('Prioridade inválida.');
    }
    prioridadeFinal = input.prioridade;
  }

  let localFinal: string | null = input.local_id ?? null;
  if (eOperador(input.perfil)) {
    const { data: u, error: eU } = await client
      .from('usuarios')
      .select('local_padrao_id')
      .eq('id', input.aberto_por)
      .maybeSingle();
    if (eU) throw eU;
    localFinal = (u?.local_padrao_id as string | null) ?? null;
  }

  const { data, error } = await client
    .from('protocolos')
    .insert({
      titulo,
      descricao,
      prioridade: prioridadeFinal,
      local_id: localFinal,
      foto_path: fotoPaths[0] ?? null,
      foto_paths: fotoPaths,
      aberto_por: input.aberto_por,
      reaberto_de: input.reaberto_de ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;

  await registrarAuditoria(
    {
      usuario_id: input.aberto_por,
      local_id: localFinal,
      acao: 'ABRIR_PROTOCOLO',
      detalhes: {
        protocolo_id: data.id,
        numero: data.numero,
        prioridade: prioridadeFinal,
        por_gestao: ehGestao,
        titulo,
        qtd_fotos: fotoPaths.length,
      },
    },
    client
  );
  return data as Protocolo;
}

/**
 * Exclui um pedido de protocolagem — apenas `ADMIN_MASTER`.
 * Chama a rota `/api/admin/excluir-protocolo` (rotina server-side com Service Role) que
 * valida o perfil do solicitante, remove a foto do bucket privado e grava auditoria
 * `EXCLUIR_PROTOCOLO` com snapshot dos campos principais.
 */
export async function excluirProtocoloAdmin(
  protocoloId: string,
  actorId: string
): Promise<void> {
  const r = await fetch('/api/admin/excluir-protocolo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ protocoloId, actorId }),
  });
  const j = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok) {
    throw new Error(j.error || 'Falha ao excluir o pedido');
  }
}
