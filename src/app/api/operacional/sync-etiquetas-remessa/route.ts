import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { sincronizarEtiquetasRemessaPorLoteSep } from '@/lib/services/etiquetas';
import { validarCredencialOperacional } from '@/lib/services/operacional-auth-server';

const PERFIS_SYNC = new Set([
  'ADMIN_MASTER',
  'MANAGER',
  'OPERATOR_WAREHOUSE',
  'OPERATOR_WAREHOUSE_DRIVER',
]);

/**
 * Grava etiquetas da remessa (`SEP-…`) no banco com **service role**, após validar login operacional.
 * Necessário quando o front usa só a chave `anon` e o RLS não permite `INSERT`/`UPDATE` em `etiquetas`.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { loteSep?: string; login?: string; senha?: string };
    const loteSep = body.loteSep?.trim();
    const login = body.login;
    const senha = body.senha;

    if (!loteSep) {
      return NextResponse.json({ error: 'Informe o lote (ex.: SEP-…).' }, { status: 400 });
    }

    const auth = await validarCredencialOperacional(login ?? '', senha ?? '');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    if (!PERFIS_SYNC.has(auth.usuario.perfil)) {
      return NextResponse.json({ error: 'Sem permissão para sincronizar etiquetas.' }, { status: 403 });
    }

    const admin = createSupabaseAdmin();
    const n = await sincronizarEtiquetasRemessaPorLoteSep(loteSep, admin);
    return NextResponse.json({ n });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Falha ao sincronizar etiquetas';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
