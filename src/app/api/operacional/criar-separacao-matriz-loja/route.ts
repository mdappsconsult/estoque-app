import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { errMessage } from '@/lib/errMessage';
import { validarCredencialOperacional } from '@/lib/services/operacional-auth-server';
import {
  criarSeparacaoMatrizLojaAtomica,
  MAX_ITENS_SEPARACAO,
} from '@/lib/services/separacao-matriz-loja-atomic';
import type { UpsertEtiquetaSeparacaoItem } from '@/lib/services/etiquetas';

const PERFIS = new Set([
  'ADMIN_MASTER',
  'MANAGER',
  'OPERATOR_WAREHOUSE',
  'OPERATOR_WAREHOUSE_DRIVER',
]);

type Body = {
  login?: string;
  senha?: string;
  origem_id?: string;
  destino_id?: string;
  itens?: { id?: string; produto_id?: string; data_validade?: string | null }[];
};

/**
 * Grava viagem + etiquetas SEP-… + transferência matriz→loja em sequência no servidor (service role),
 * com compensação se a transferência falhar. Exige login operacional válido (mesma regra da sincronização de etiquetas).
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const login = body.login ?? '';
    const senha = body.senha ?? '';
    const origemId = body.origem_id?.trim() ?? '';
    const destinoId = body.destino_id?.trim() ?? '';
    const itensRaw = Array.isArray(body.itens) ? body.itens : [];

    if (!origemId || !destinoId) {
      return NextResponse.json({ error: 'Informe origem e destino.' }, { status: 400 });
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
    if (itens.length > MAX_ITENS_SEPARACAO) {
      return NextResponse.json(
        { error: `No máximo ${MAX_ITENS_SEPARACAO} unidades por requisição.` },
        { status: 400 }
      );
    }

    const admin = createSupabaseAdmin();

    const { data: origemLoc, error: eo } = await admin
      .from('locais')
      .select('id, tipo')
      .eq('id', origemId)
      .maybeSingle();
    if (eo) throw eo;
    if (!origemLoc || origemLoc.tipo !== 'WAREHOUSE') {
      return NextResponse.json({ error: 'Origem deve ser um armazém (WAREHOUSE).' }, { status: 400 });
    }

    const { data: destLoc, error: ed } = await admin
      .from('locais')
      .select('id, tipo')
      .eq('id', destinoId)
      .maybeSingle();
    if (ed) throw ed;
    if (!destLoc || destLoc.tipo !== 'STORE') {
      return NextResponse.json({ error: 'Destino deve ser uma loja (STORE).' }, { status: 400 });
    }

    const resultado = await criarSeparacaoMatrizLojaAtomica(admin, {
      origem_id: origemId,
      destino_id: destinoId,
      criado_por: auth.usuario.id,
      itens,
    });

    return NextResponse.json(resultado);
  } catch (e) {
    const msg = errMessage(e, 'Falha ao registrar separação');
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
