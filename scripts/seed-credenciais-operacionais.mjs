#!/usr/bin/env node
/**
 * Grava login_operacional + senha_hash (bcrypt) no Supabase a partir de JSON local.
 * Uso: copie operacional-seed.example.json → operacional-seed.local.json, preencha "senha",
 * depois: npm run seed:operacional
 *
 * Requer NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (ex.: .env.local).
 */
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadDotEnvLocal() {
  const p = join(root, '.env.local');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (k && process.env[k] === undefined) process.env[k] = v;
  }
}

function normalizarTexto(valor) {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

async function buscarLojaStorePorNome(client, nome) {
  const t = nome.trim();
  if (!t) return null;

  const { data: exato } = await client
    .from('locais')
    .select('id')
    .eq('tipo', 'STORE')
    .eq('status', 'ativo')
    .eq('nome', t)
    .maybeSingle();
  if (exato?.id) return exato.id;

  const { data: aprox } = await client
    .from('locais')
    .select('id')
    .eq('tipo', 'STORE')
    .eq('status', 'ativo')
    .ilike('nome', `%${t}%`)
    .order('nome', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (aprox?.id) return aprox.id;

  const { data: lojas } = await client
    .from('locais')
    .select('id, nome')
    .eq('tipo', 'STORE')
    .eq('status', 'ativo')
    .order('nome', { ascending: true });

  const alvo = normalizarTexto(t);
  const exataNormalizada = (lojas || []).find((loja) => normalizarTexto(loja.nome) === alvo);
  if (exataNormalizada?.id) return exataNormalizada.id;

  const aproximadaNormalizada = (lojas || []).find((loja) => normalizarTexto(loja.nome).includes(alvo));

  return aproximadaNormalizada?.id || null;
}

async function buscarLocalPadraoOperacional(client, credencial) {
  const { perfil } = credencial;

  if (perfil === 'OPERATOR_WAREHOUSE' || perfil === 'OPERATOR_WAREHOUSE_DRIVER' || perfil === 'MANAGER') {
    const { data } = await client
      .from('locais')
      .select('id')
      .eq('tipo', 'WAREHOUSE')
      .eq('status', 'ativo')
      .order('nome', { ascending: true })
      .limit(1)
      .maybeSingle();

    return data?.id || null;
  }

  if (perfil === 'OPERATOR_STORE') {
    if (credencial.lojaPadraoNome?.trim()) {
      const porNome = await buscarLojaStorePorNome(client, credencial.lojaPadraoNome);
      if (porNome) return porNome;
      return null;
    }

    const { data } = await client
      .from('locais')
      .select('id')
      .eq('tipo', 'STORE')
      .eq('status', 'ativo')
      .order('nome', { ascending: true })
      .limit(1)
      .maybeSingle();

    return data?.id || null;
  }

  return null;
}

async function upsertUsuarioOperacional(client, credencial) {
  const localPadraoId = await buscarLocalPadraoOperacional(client, credencial);
  const loginN = credencial.login.trim().toLowerCase();

  const { data: existente, error: erroBusca } = await client
    .from('usuarios')
    .select('*')
    .eq('telefone', credencial.telefone)
    .maybeSingle();
  if (erroBusca) throw erroBusca;

  if (existente) {
    if (credencial.perfil === 'OPERATOR_STORE' && !localPadraoId) {
      throw new Error(`Nao foi possivel identificar a loja padrao de ${credencial.nome}.`);
    }

    const { data: atualizado, error: erroAtualizacao } = await client
      .from('usuarios')
      .update({
        nome: credencial.nome,
        perfil: credencial.perfil,
        local_padrao_id: localPadraoId,
        status: 'ativo',
        login_operacional: loginN,
      })
      .eq('id', existente.id)
      .select('*')
      .single();
    if (erroAtualizacao) throw erroAtualizacao;
    return atualizado;
  }

  const { data: criado, error: erroCriacao } = await client
    .from('usuarios')
    .insert({
      nome: credencial.nome,
      telefone: credencial.telefone,
      perfil: credencial.perfil,
      local_padrao_id: localPadraoId,
      status: 'ativo',
      login_operacional: loginN,
    })
    .select('*')
    .single();
  if (erroCriacao) throw erroCriacao;
  return criado;
}

function senhaValida(s) {
  if (typeof s !== 'string') return false;
  const t = s.trim();
  if (!t) return false;
  if (t === 'PREENCHER' || t === 'TROCAR' || t === 'COLOQUE_A_SENHA_AQUI') return false;
  return true;
}

loadDotEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (.env.local ou ambiente).');
  process.exit(1);
}

const localPath = join(__dirname, 'operacional-seed.local.json');
const examplePath = join(__dirname, 'operacional-seed.example.json');

if (!existsSync(localPath)) {
  console.error(
    `Arquivo ausente: ${localPath}\nCopie operacional-seed.example.json para operacional-seed.local.json, preencha as senhas e execute de novo.`
  );
  process.exit(1);
}

let entries;
try {
  entries = JSON.parse(readFileSync(localPath, 'utf8'));
} catch (e) {
  console.error('JSON inválido em operacional-seed.local.json:', e.message);
  process.exit(1);
}

if (!Array.isArray(entries)) {
  console.error('operacional-seed.local.json deve ser um array de objetos.');
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

let ok = 0;
let skipped = 0;

for (const row of entries) {
  const { login, senha, nome, telefone, perfil, lojaPadraoNome } = row;
  if (!login || !nome || !telefone || !perfil) {
    console.warn('Ignorando linha incompleta:', row);
    skipped++;
    continue;
  }
  if (!senhaValida(senha)) {
    console.warn(`Pulando ${login}: senha vazia ou placeholder (preencha no JSON local).`);
    skipped++;
    continue;
  }

  try {
    const usuario = await upsertUsuarioOperacional(admin, {
      login,
      nome,
      telefone,
      perfil,
      lojaPadraoNome,
    });
    const hash = await bcrypt.hash(String(senha).trim(), 10);
    const { error: upErr } = await admin.from('credenciais_login_operacional').upsert({
      usuario_id: usuario.id,
      senha_hash: hash,
      updated_at: new Date().toISOString(),
    });
    if (upErr) throw upErr;
    console.log(`OK: ${login} → usuario ${usuario.id}`);
    ok++;
  } catch (e) {
    console.error(`Falha em ${login}:`, e.message || e);
    process.exitCode = 1;
  }
}

console.log(`\nResumo: ${ok} gravados, ${skipped} ignorados.`);
if (!existsSync(examplePath)) {
  console.warn('(Aviso: operacional-seed.example.json não encontrado no repositório.)');
}
