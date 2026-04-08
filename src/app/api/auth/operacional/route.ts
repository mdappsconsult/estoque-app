import { NextResponse } from 'next/server';
import { validarCredencialOperacional } from '@/lib/services/operacional-auth-server';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { login?: string; senha?: string };
    const loginRaw = body.login;
    const senha = body.senha;

    const r = await validarCredencialOperacional(loginRaw ?? '', senha ?? '');
    if (!r.ok) {
      return NextResponse.json({ error: r.error }, { status: r.status });
    }
    return NextResponse.json({ usuario: r.usuario });
  } catch {
    return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  }
}
