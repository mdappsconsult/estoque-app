import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { validarCredencialOperacional } from '@/lib/services/operacional-auth-server';
import { enviarPushParaUsuarios, type PayloadPush } from '@/lib/push/servidor';
import { errMessage } from '@/lib/errMessage';
import type { PerfilUsuario } from '@/types/database';
import {
  PRIORIDADE_LABEL,
  STATUS_LABEL,
} from '@/lib/protocolos/ui-labels';

type AcaoProtocolo =
  | 'ABRIU'
  | 'ACEITOU'
  | 'RECUSOU'
  | 'INICIOU'
  | 'CONCLUIU'
  | 'FECHOU'
  | 'COMENTOU'
  | 'MUDOU_PRIORIDADE';

type Body = {
  login?: string;
  senha?: string;
  protocoloId?: string;
  acao?: AcaoProtocolo;
  /** Texto extra (ex.: comentário, motivo, prioridade nova). */
  detalhe?: string | null;
};

const PERFIS_GESTAO: PerfilUsuario[] = ['MANAGER', 'ADMIN_MASTER'];

/**
 * Calcula destinatários de cada ação:
 * - ABRIU: toda gestão (MANAGER + ADMIN_MASTER) ativa.
 * - ACEITOU/RECUSOU/INICIOU/MUDOU_PRIORIDADE: autor do protocolo (se houver).
 * - CONCLUIU: autor + toda gestão (alguém precisa fechar; secretaria precisa saber).
 * - FECHOU: autor.
 * - COMENTOU: "o outro lado" → se quem comentou é gestão, autor recebe;
 *             se quem comentou é operador, toda gestão recebe.
 * Sempre remove `acaoUsuarioId` para não notificar quem disparou.
 */
async function destinatarios(
  admin: ReturnType<typeof createSupabaseAdmin>,
  protocolo: { aberto_por: string; gerente_id: string | null },
  acao: AcaoProtocolo,
  acaoUsuarioId: string,
  acaoUsuarioPerfil: PerfilUsuario
): Promise<string[]> {
  const ids = new Set<string>();

  const incluirToda = async () => {
    const { data } = await admin
      .from('usuarios')
      .select('id')
      .in('perfil', PERFIS_GESTAO)
      .eq('status', 'ativo');
    for (const u of data || []) ids.add(u.id as string);
  };

  if (acao === 'ABRIU') {
    await incluirToda();
  } else if (acao === 'CONCLUIU') {
    ids.add(protocolo.aberto_por);
    await incluirToda();
  } else if (acao === 'COMENTOU') {
    const ehGestaoQuemFalou = PERFIS_GESTAO.includes(acaoUsuarioPerfil);
    if (ehGestaoQuemFalou) {
      ids.add(protocolo.aberto_por);
    } else {
      await incluirToda();
    }
  } else if (acao === 'ACEITOU' || acao === 'RECUSOU' || acao === 'INICIOU' || acao === 'MUDOU_PRIORIDADE' || acao === 'FECHOU') {
    ids.add(protocolo.aberto_por);
  }

  ids.delete(acaoUsuarioId);
  return Array.from(ids);
}

function montarPayload(
  acao: AcaoProtocolo,
  protocolo: {
    numero: number;
    titulo: string;
    prioridade: string;
    status: string;
    local_nome: string | null;
  },
  autorAcaoNome: string,
  detalhe: string | null
): PayloadPush {
  const numero = `Pedido #${protocolo.numero}`;
  const titulo = protocolo.titulo || '(sem título)';
  const lugar = protocolo.local_nome || 'Administração';

  if (acao === 'ABRIU') {
    return {
      titulo: `Novo pedido em ${lugar}`,
      corpo: `${autorAcaoNome} abriu: ${titulo}`,
      tag: `protocolo-${protocolo.numero}-aberto`,
    };
  }
  if (acao === 'ACEITOU') {
    return {
      titulo: `${numero} aceito`,
      corpo: `${autorAcaoNome} aceitou: ${titulo}`,
      tag: `protocolo-${protocolo.numero}`,
    };
  }
  if (acao === 'RECUSOU') {
    return {
      titulo: `${numero} recusado`,
      corpo: detalhe
        ? `${autorAcaoNome} recusou — ${detalhe}`
        : `${autorAcaoNome} recusou: ${titulo}`,
      tag: `protocolo-${protocolo.numero}`,
    };
  }
  if (acao === 'INICIOU') {
    return {
      titulo: `${numero} em execução`,
      corpo: detalhe
        ? `${autorAcaoNome} chamou ${detalhe} para resolver`
        : `${autorAcaoNome} iniciou a execução: ${titulo}`,
      tag: `protocolo-${protocolo.numero}`,
    };
  }
  if (acao === 'CONCLUIU') {
    return {
      titulo: `${numero} pronto, conferir`,
      corpo: `${autorAcaoNome} marcou pronto: ${titulo}`,
      tag: `protocolo-${protocolo.numero}`,
    };
  }
  if (acao === 'FECHOU') {
    return {
      titulo: `${numero} encerrado`,
      corpo: `${autorAcaoNome} encerrou: ${titulo}`,
      tag: `protocolo-${protocolo.numero}`,
    };
  }
  if (acao === 'COMENTOU') {
    return {
      titulo: `${numero} — novo comentário`,
      corpo: detalhe ? `${autorAcaoNome}: ${detalhe}` : `${autorAcaoNome} comentou em "${titulo}"`,
      tag: `protocolo-${protocolo.numero}-comentario`,
    };
  }
  if (acao === 'MUDOU_PRIORIDADE') {
    return {
      titulo: `${numero} agora é ${detalhe || 'outra urgência'}`,
      corpo: `${autorAcaoNome} mudou a urgência: ${titulo}`,
      tag: `protocolo-${protocolo.numero}`,
    };
  }
  return {
    titulo: numero,
    corpo: `${STATUS_LABEL[protocolo.status as keyof typeof STATUS_LABEL] || protocolo.status} · ${PRIORIDADE_LABEL[protocolo.prioridade as keyof typeof PRIORIDADE_LABEL] || protocolo.prioridade}`,
    tag: `protocolo-${protocolo.numero}`,
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const auth = await validarCredencialOperacional(body.login ?? '', body.senha ?? '');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const protocoloId = (body.protocoloId || '').trim();
    const acao = body.acao;
    if (!protocoloId || !acao) {
      return NextResponse.json({ error: 'protocoloId e acao são obrigatórios.' }, { status: 400 });
    }

    const admin = createSupabaseAdmin();
    const { data: p, error } = await admin
      .from('protocolos')
      .select('id, numero, titulo, prioridade, status, aberto_por, gerente_id, local:locais(nome)')
      .eq('id', protocoloId)
      .maybeSingle();
    if (error || !p) {
      return NextResponse.json({ error: 'Protocolo não encontrado.' }, { status: 404 });
    }

    const localNome =
      (p.local && (Array.isArray(p.local) ? p.local[0]?.nome : (p.local as { nome?: string }).nome)) ||
      null;

    const dest = await destinatarios(
      admin,
      { aberto_por: p.aberto_por as string, gerente_id: (p.gerente_id as string) || null },
      acao,
      auth.usuario.id,
      auth.usuario.perfil
    );

    const payload = montarPayload(
      acao,
      {
        numero: Number(p.numero),
        titulo: String(p.titulo),
        prioridade: String(p.prioridade),
        status: String(p.status),
        local_nome: localNome,
      },
      auth.usuario.nome || 'Alguém',
      body.detalhe ?? null
    );

    const r = await enviarPushParaUsuarios(dest, payload);
    return NextResponse.json({ ok: true, ...r, destinatarios: dest.length });
  } catch (e) {
    return NextResponse.json({ error: errMessage(e, 'Falha ao disparar push') }, { status: 500 });
  }
}
