import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { errMessage } from '@/lib/errMessage';

/**
 * Gera URL assinada temporária para a foto de um protocolo.
 * Não exige senha operacional: a referência (`path`) já está em `protocolos.foto_path`
 * (acessível via PostgREST anon) e a URL expira em 1h. Mantém o bucket privado,
 * sem expor service role no cliente.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { path?: string };
    const path = String(body.path ?? '').trim();
    if (!path) {
      return NextResponse.json({ error: 'Caminho da foto vazio.' }, { status: 400 });
    }
    if (path.includes('..') || path.startsWith('/')) {
      return NextResponse.json({ error: 'Caminho inválido.' }, { status: 400 });
    }

    const admin = createSupabaseAdmin();
    const { data, error } = await admin.storage
      .from('protocolos-fotos')
      .createSignedUrl(path, 60 * 60);
    if (error || !data?.signedUrl) {
      return NextResponse.json(
        { error: error?.message || 'Não foi possível gerar a URL da foto.' },
        { status: 404 }
      );
    }
    return NextResponse.json({ url: data.signedUrl });
  } catch (e) {
    return NextResponse.json({ error: errMessage(e, 'Falha ao gerar URL') }, { status: 500 });
  }
}
