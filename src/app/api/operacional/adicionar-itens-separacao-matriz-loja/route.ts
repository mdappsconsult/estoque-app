import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { errMessage } from '@/lib/errMessage';
import { validarCredencialOperacional } from '@/lib/services/operacional-auth-server';
import {
  adicionarItensSeparacaoMatrizLojaNaTransferencia,
  CHUNK_ITENS_SEPARACAO_HTTP,
} from '@/lib/services/separacao-matriz-loja-atomic';
import type { UpsertEtiquetaSeparacaoItem } from '@/lib/services/etiquetas';

export const maxDuration = 180;

const PERFIS = new Set([
  'ADMIN_MASTER',
  'MANAGER',
  'OPERATOR_WAREHOUSE',
  'OPERATOR_WAREHOUSE_DRIVER',
]);

type Body = {
  login?: string;
  senha?: string;
  transferencia_id?: string;
  itens?: { id?: string; produto_id?: string; data_validade?: string | null }[];
};

/** Continuação da separação matriz→loja: mesma remessa, novo lote de unidades (até `CHUNK_ITENS_SEPARACAO_HTTP` por POST). */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const login = body.login ?? '';
    const senha = body.senha ?? '';
    const transferenciaId = body.transferencia_id?.trim() ?? '';
    const itensRaw = Array.isArray(body.itens) ? body.itens : [];

    if (!transferenciaId) {
      return NextResponse.json({ error: 'Informe transferencia_id.' }, { status: 400 });
    }

    const auth = await validarCredencialOperacional(login, senha);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    if (!PERFIS.has(auth.usuario.perfil)) {
      return NextResponse.json({ error: 'Sem permissão para registrar separação matriz → loja.' }, { status: 403 });
    }

    const itens: UpsertEtiquetaSeparacaoItem[] = [];
    const seen = new Set<string>();
    for (const row of itensRaw) {
      const id = String(row.id || '').trim();
      const produto_id = String(row.produto_id || '').trim();
      if (!id || !produto_id) continue;
      if (seen.has(id)) {
        return NextResponse.json({ error: 'Lista contém o mesmo item duplicado.' }, { status: 400 });
      }
      seen.add(id);
      itens.push({
        id,
        produto_id,
        data_validade: row.data_validade ?? null,
      });
    }

    if (itens.length === 0) {
      return NextResponse.json({ error: 'Envie pelo menos um item (id e produto_id).' }, { status: 400 });
    }
    if (itens.length > CHUNK_ITENS_SEPARACAO_HTTP) {
      return NextResponse.json(
        { error: `No máximo ${CHUNK_ITENS_SEPARACAO_HTTP} unidades por requisição de continuação.` },
        { status: 400 }
      );
    }

    const admin = createSupabaseAdmin();

    const resultado = await adicionarItensSeparacaoMatrizLojaNaTransferencia(admin, {
      transferencia_id: transferenciaId,
      criado_por: auth.usuario.id,
      itens,
    });

    return NextResponse.json(resultado);
  } catch (e) {
    const msg = errMessage(e, 'Falha ao acrescentar itens na separação');
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
