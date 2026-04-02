#!/usr/bin/env node
/**
 * Mantém o MCP Supabase do Cursor no mesmo project ref que .env.local deste repositório.
 * Atualiza ~/.cursor/supabase-mcp.env (SUPABASE_MCP_PROJECT_REF + ESTOQUE_APP_ENV_PATH).
 * Reinicie o MCP / o Cursor após rodar.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

const repoRoot = resolve(process.cwd());
const envLocal = resolve(repoRoot, '.env.local');
const mcpEnvPath = resolve(homedir(), '.cursor', 'supabase-mcp.env');

if (!existsSync(envLocal)) {
  console.error('Crie .env.local na raiz do estoque-app com NEXT_PUBLIC_SUPABASE_URL.');
  process.exit(1);
}

const raw = readFileSync(envLocal, 'utf8');
let url = '';
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^\s*NEXT_PUBLIC_SUPABASE_URL\s*=\s*(.+)\s*$/);
  if (m) {
    url = m[1].replace(/^['"]|['"]$/g, '').trim();
    break;
  }
}
if (!url) {
  console.error('NEXT_PUBLIC_SUPABASE_URL ausente em .env.local');
  process.exit(1);
}
let ref;
try {
  ref = new URL(url).hostname.split('.')[0];
} catch {
  console.error('URL inválida:', url);
  process.exit(1);
}

const absEnvLocal = envLocal;
let outLines = [];
if (existsSync(mcpEnvPath)) {
  outLines = readFileSync(mcpEnvPath, 'utf8').split(/\r?\n/);
} else {
  outLines = ['# Gerado/atualizado por npm run sync:mcp-supabase', '# Preencha SUPABASE_ACCESS_TOKEN para o MCP Supabase (dashboard → tokens).'];
}

function upsert(key, value) {
  const line = `${key}=${value}`;
  const idx = outLines.findIndex((l) => l.trimStart().startsWith(`${key}=`));
  if (idx >= 0) outLines[idx] = line;
  else {
    outLines.push('');
    outLines.push(`# Alinhado ao app Next (${new Date().toISOString().slice(0, 10)})`);
    outLines.push(line);
  }
}

upsert('ESTOQUE_APP_ENV_PATH', absEnvLocal);
upsert('SUPABASE_MCP_PROJECT_REF', ref);

writeFileSync(mcpEnvPath, `${outLines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`, 'utf8');

console.log('Atualizado:', mcpEnvPath);
console.log('  ESTOQUE_APP_ENV_PATH=' + absEnvLocal);
console.log('  SUPABASE_MCP_PROJECT_REF=' + ref);
console.log('');
console.log('Reinicie o servidor MCP Supabase no Cursor (Command Palette → MCP: Restart) ou feche e abra o Cursor.');
