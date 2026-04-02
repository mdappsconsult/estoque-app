#!/usr/bin/env node
/**
 * Imprime o project ref do Supabase configurado em .env.local (mesmo que o Next usa).
 * Útil para conferir se o MCP / SQL Editor está no mesmo projeto que o localhost.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const envPath = resolve(root, '.env.local');

if (!existsSync(envPath)) {
  console.error('Arquivo .env.local não encontrado na raiz do projeto.');
  process.exit(1);
}

const raw = readFileSync(envPath, 'utf8');
const lines = raw.split(/\r?\n/);
let url = '';
for (const line of lines) {
  const m = line.match(/^\s*NEXT_PUBLIC_SUPABASE_URL\s*=\s*(.+)\s*$/);
  if (m) {
    url = m[1].replace(/^['"]|['"]$/g, '').trim();
    break;
  }
}

if (!url) {
  console.error('NEXT_PUBLIC_SUPABASE_URL não encontrado em .env.local');
  process.exit(1);
}

try {
  const host = new URL(url).hostname;
  const ref = host.split('.')[0];
  console.log('NEXT_PUBLIC_SUPABASE_URL (host):', host);
  console.log('Project ref (primeiro segmento):', ref);
  console.log('');
  console.log(
    'No dashboard Supabase, confira se o projeto aberto é o mesmo ref. ' +
      'Consultas via MCP ou outro projeto podem divergir do que o app mostra.'
  );
} catch {
  console.error('URL inválida:', url);
  process.exit(1);
}
