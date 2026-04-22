import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { errMessage } from '@/lib/errMessage';
import { validarCredencialOperacional } from '@/lib/services/operacional-auth-server';
import { extrairNotaCompraDeImagem } from '@/lib/nota-compra/ocr-extrair';

const MAX_BASE64_CHARS = 11_500_000;
const MIME_OK = new Set(['image/jpeg', 'image/png', 'image/webp']);

type Body = {
  login?: string;
  senha?: string;
  imageBase64?: string;
  mimeType?: string;
};

function validarImagemBuffer(buf: Buffer, mimeType: string): { ok: true } | { ok: false; error: string } {
  if (!MIME_OK.has(mimeType)) {
    return { ok: false, error: 'Tipo de imagem não suportado. Use JPEG, PNG ou WebP.' };
  }
  if (buf.length < 500) {
    return { ok: false, error: 'Imagem muito pequena para processar.' };
  }
  if (buf.length > 9 * 1024 * 1024) {
    return { ok: false, error: 'Imagem grande demais após decodificar.' };
  }
  if (mimeType === 'image/jpeg' && !buf.slice(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return { ok: false, error: 'Arquivo não parece JPEG válido.' };
  }
  if (mimeType === 'image/png' && buf.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    return { ok: false, error: 'Arquivo não parece PNG válido.' };
  }
  return { ok: true };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const login = String(body.login ?? '');
    const senha = String(body.senha ?? '');
    const imageBase64 = String(body.imageBase64 ?? '').replace(/\s/g, '');
    const mimeType = String(body.mimeType ?? 'image/jpeg').toLowerCase();

    if (!imageBase64) {
      return NextResponse.json({ error: 'Envie a imagem em base64.' }, { status: 400 });
    }
    if (imageBase64.length > MAX_BASE64_CHARS) {
      return NextResponse.json({ error: 'Imagem muito grande.' }, { status: 400 });
    }

    const auth = await validarCredencialOperacional(login, senha);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    let buf: Buffer;
    try {
      buf = Buffer.from(imageBase64, 'base64');
    } catch {
      return NextResponse.json({ error: 'Base64 inválido.' }, { status: 400 });
    }

    const v = validarImagemBuffer(buf, mimeType);
    if (!v.ok) {
      return NextResponse.json({ error: v.error }, { status: 400 });
    }

    const admin = createSupabaseAdmin();
    const fileName = `${auth.usuario.id}/${Date.now()}-${randomUUID().slice(0, 8)}.${
      mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg'
    }`;

    const { error: upErr } = await admin.storage.from('notas-compra').upload(fileName, buf, {
      contentType: mimeType,
      upsert: false,
    });
    if (upErr) {
      console.error('Storage notas-compra:', upErr);
      const msgSupabase = [upErr.message, (upErr as { error?: string }).error].filter(Boolean).join(' — ');
      return NextResponse.json(
        {
          error:
            'Não foi possível salvar a imagem no Storage. Crie o bucket «notas-compra» (privado) ou rode o SQL em docs/consultas-sql/storage-bucket-notas-compra.sql.',
          detalhe: msgSupabase || 'erro desconhecido do Storage',
        },
        { status: 503 }
      );
    }

    const { extracao, modo } = await extrairNotaCompraDeImagem(imageBase64, mimeType);

    await admin.from('auditoria').insert({
      usuario_id: auth.usuario.id,
      local_id: auth.usuario.local_padrao_id ?? null,
      acao: 'EXTRAIR_NOTA_COMPRA_IMAGEM',
      detalhes: {
        storage_path: fileName,
        modo_ocr: modo,
        linhas: extracao.linhas.length,
        nota_fiscal: extracao.nota_fiscal,
      },
    });

    return NextResponse.json({
      extracao,
      storagePath: fileName,
      modoOcr: modo,
    });
  } catch (e) {
    const msg = errMessage(e, 'Falha ao extrair dados da nota');
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
