#!/usr/bin/env node
/**
 * Testa as leituras usadas em «Produções registradas» (sem Next).
 * Uso: `npm run test:historico-producao`
 * ou `node --env-file=.env.local scripts/test-historico-producao.mjs`
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadEnvLocal() {
  const p = join(root, '.env.local');
  if (!existsSync(p)) return;
  const raw = readFileSync(p, 'utf8');
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error(
    'Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY (ex.: npm run test:historico-producao com .env.local na raiz).'
  );
  process.exit(1);
}

const HISTORICO_PRODUCAO_SELECT = [
  'id',
  'created_at',
  'produto_id',
  'quantidade',
  'num_baldes',
  'local_id',
  'responsavel',
  'produtos(nome)',
  'locais(nome)',
].join(', ');

const supabase = createClient(url, key);

async function main() {
  console.log('1) GET producoes (select do histórico)…');
  const { data: rows, error: e1 } = await supabase
    .from('producoes')
    .select(HISTORICO_PRODUCAO_SELECT)
    .order('created_at', { ascending: false })
    .range(0, 9);
  if (e1) {
    console.error('   Falhou:', e1.message);
    process.exit(1);
  }
  console.log('   OK, linhas:', rows?.length ?? 0);

  const ids = (rows || []).map((r) => r.id).filter(Boolean);
  if (ids.length === 0) {
    console.log('   (sem produções — nada a testar em itens/consumo)');
    process.exit(0);
  }

  const slice = ids.slice(0, 20);
  console.log('2) GET itens …in(producao_id) até 20 ids…');
  const { data: itens, error: e2 } = await supabase.from('itens').select('id, producao_id').in('producao_id', slice);
  if (e2) {
    console.warn('   Aviso:', e2.message);
    if (/producao_id/i.test(String(e2.message)) && /does not exist|não existe|column/i.test(String(e2.message))) {
      console.warn('   → Aplique a migração 20260420120000_producao_lote_rastreio_etiqueta.sql (coluna itens.producao_id).');
    } else {
      process.exit(1);
    }
  } else {
    console.log('   OK, linhas itens:', itens?.length ?? 0);
  }

  console.log('3) GET producao_consumo_itens …in(producao_id)…');
  const { data: cons, error: e3 } = await supabase
    .from('producao_consumo_itens')
    .select('producao_id')
    .in('producao_id', slice);
  if (e3) {
    console.error('   Falhou:', e3.message);
    process.exit(1);
  }
  console.log('   OK, linhas consumo:', cons?.length ?? 0);

  const itemIds = (itens || []).slice(0, 20).map((r) => r.id).filter(Boolean);
  if (itemIds.length > 0 && !e2) {
    console.log('4) GET etiquetas …in(id) até 20 ids…');
    const { error: e4 } = await supabase.from('etiquetas').select('id, lote_producao_numero').in('id', itemIds);
    if (e4) {
      console.error('   Falhou:', e4.message);
      process.exit(1);
    }
    console.log('   OK');
  } else {
    console.log('4) (sem itens de acabado — pula etiquetas)');
  }

  console.log('\nFluxo terminado (veja avisos acima). Sem erro de rede fatal.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
