import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { darEntradaFaltanteNaLojaDivergencia } from '@/lib/services/divergencias';
import { validarCredencialOperacional } from '@/lib/services/operacional-auth-server';

const PERFIS = new Set(['ADMIN_MASTER', 'MANAGER']);

/**
 * Após conferir o faltante físico, o gestor move a unidade para o estoque da loja destino
 * e encerra a linha de divergência (service role + login operacional).
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      divergenciaId?: string;
      login?: string;
      senha?: string;
    };
    const divergenciaId = body.divergenciaId?.trim();
    const login = body.login;
    const senha = body.senha;

    if (!divergenciaId) {
      return NextResponse.json({ error: 'Informe o id da divergência.' }, { status: 400 });
    }

    const auth = await validarCredencialOperacional(login ?? '', senha ?? '');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    if (!PERFIS.has(auth.usuario.perfil)) {
      return NextResponse.json(
        { error: 'Sem permissão para registrar entrada de faltante na loja.' },
        { status: 403 }
      );
    }

    const admin = createSupabaseAdmin();
    await darEntradaFaltanteNaLojaDivergencia(divergenciaId, auth.usuario.id, admin);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Falha ao registrar entrada';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
