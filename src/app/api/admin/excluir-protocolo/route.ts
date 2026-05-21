import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { registrarAuditoria } from '@/lib/services/auditoria';

/**
 * Exclui um protocolo (pedido de protocolagem) — só `ADMIN_MASTER`.
 *
 * - `protocolo_comentarios` cai em cascade (FK `ON DELETE CASCADE` na migração `20260521120000_protocolos.sql`).
 * - `reaberto_de` em outros protocolos vira NULL (FK `ON DELETE SET NULL`).
 * - Foto no bucket `protocolos-fotos` é apagada se houver `foto_path` (best-effort: se o storage falhar
 *   o protocolo já foi deletado e o registro de auditoria preserva o `foto_path` antigo).
 * - `auditoria` referencia o protocolo só por `detalhes->>'protocolo_id'` (sem FK) — registros antigos
 *   ficam preservados, e este DELETE adiciona uma linha `EXCLUIR_PROTOCOLO` com snapshot.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      protocoloId?: string;
      actorId?: string;
    };

    const protocoloId = body.protocoloId?.trim();
    const actorId = body.actorId?.trim();
    if (!protocoloId || !actorId) {
      return NextResponse.json(
        { error: 'protocoloId e actorId são obrigatórios' },
        { status: 400 }
      );
    }

    let admin;
    try {
      admin = createSupabaseAdmin();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Servidor mal configurado';
      return NextResponse.json({ error: msg }, { status: 503 });
    }

    const { data: actor, error: actorErr } = await admin
      .from('usuarios')
      .select('perfil')
      .eq('id', actorId)
      .eq('status', 'ativo')
      .maybeSingle();

    if (actorErr || !actor || actor.perfil !== 'ADMIN_MASTER') {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }

    const { data: protocolo, error: pErr } = await admin
      .from('protocolos')
      .select('id, numero, titulo, status, prioridade, aberto_por, local_id, foto_path, foto_paths, created_at')
      .eq('id', protocoloId)
      .maybeSingle();

    if (pErr) {
      console.error('Erro ao buscar protocolo:', pErr);
      return NextResponse.json({ error: 'Falha ao carregar o pedido' }, { status: 500 });
    }
    if (!protocolo) {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
    }

    const { error: delErr } = await admin.from('protocolos').delete().eq('id', protocoloId);
    if (delErr) {
      console.error('Erro ao excluir protocolo:', delErr);
      return NextResponse.json({ error: 'Falha ao excluir o pedido' }, { status: 500 });
    }

    /** União para cobrir registros antigos (`foto_path`) + multi-foto (`foto_paths`). */
    const fotosParaRemover = Array.from(
      new Set<string>(
        [...((protocolo.foto_paths as string[] | null) || []), protocolo.foto_path].filter(
          (p): p is string => !!p
        )
      )
    );
    if (fotosParaRemover.length > 0) {
      const { error: storageErr } = await admin.storage
        .from('protocolos-fotos')
        .remove(fotosParaRemover);
      if (storageErr) {
        // Não bloqueia: o registro principal já foi removido e fotos viram órfãs (snapshot na auditoria).
        console.warn('Fotos do protocolo não puderam ser removidas do bucket:', storageErr);
      }
    }

    await registrarAuditoria(
      {
        usuario_id: actorId,
        local_id: protocolo.local_id,
        acao: 'EXCLUIR_PROTOCOLO',
        detalhes: {
          protocolo_id: protocolo.id,
          numero: protocolo.numero,
          titulo: protocolo.titulo,
          status: protocolo.status,
          prioridade: protocolo.prioridade,
          aberto_por: protocolo.aberto_por,
          qtd_fotos: fotosParaRemover.length,
          foto_paths: fotosParaRemover,
          created_at: protocolo.created_at,
        },
      },
      admin
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Erro inesperado em /api/admin/excluir-protocolo:', e);
    return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  }
}
