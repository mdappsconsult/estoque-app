import { supabase } from '@/lib/supabase';
import { Usuario } from '@/types/database';

type CredencialOperacional = {
  login: string;
  senha: string;
  nome: string;
  telefone: string;
  perfil: Usuario['perfil'];
};

const CREDENCIAIS_OPERACIONAIS: CredencialOperacional[] = [
  {
    login: 'leonardo',
    senha: '123456',
    nome: 'Leonardo',
    telefone: '550000000001',
    perfil: 'OPERATOR_WAREHOUSE',
  },
  {
    login: 'marco',
    senha: '654321',
    nome: 'Marco',
    telefone: '550000000002',
    perfil: 'ADMIN_MASTER',
  },
];

function normalizarLogin(login: string): string {
  return login.trim().toLowerCase();
}

async function buscarLocalPadraoParaPerfil(perfil: Usuario['perfil']): Promise<string | null> {
  if (perfil === 'OPERATOR_WAREHOUSE') {
    const { data } = await supabase
      .from('locais')
      .select('id')
      .eq('tipo', 'WAREHOUSE')
      .eq('status', 'ativo')
      .order('nome', { ascending: true })
      .limit(1)
      .maybeSingle();

    return data?.id || null;
  }

  return null;
}

async function upsertUsuarioOperacional(credencial: CredencialOperacional): Promise<Usuario> {
  const localPadraoId = await buscarLocalPadraoParaPerfil(credencial.perfil);

  const { data: existente, error: erroBusca } = await supabase
    .from('usuarios')
    .select('*')
    .eq('telefone', credencial.telefone)
    .maybeSingle();
  if (erroBusca) throw erroBusca;

  if (existente) {
    const { data: atualizado, error: erroAtualizacao } = await supabase
      .from('usuarios')
      .update({
        nome: credencial.nome,
        perfil: credencial.perfil,
        local_padrao_id: localPadraoId,
        status: 'ativo',
      })
      .eq('id', existente.id)
      .select('*')
      .single();
    if (erroAtualizacao) throw erroAtualizacao;
    return atualizado;
  }

  const { data: criado, error: erroCriacao } = await supabase
    .from('usuarios')
    .insert({
      nome: credencial.nome,
      telefone: credencial.telefone,
      perfil: credencial.perfil,
      local_padrao_id: localPadraoId,
      status: 'ativo',
    })
    .select('*')
    .single();
  if (erroCriacao) throw erroCriacao;
  return criado;
}

export async function autenticarOperacional(login: string, senha: string): Promise<Usuario> {
  const loginNormalizado = normalizarLogin(login);
  const credencial = CREDENCIAIS_OPERACIONAIS.find(
    (item) => item.login === loginNormalizado && item.senha === senha
  );

  if (!credencial) {
    throw new Error('Usuário ou senha inválidos');
  }

  return upsertUsuarioOperacional(credencial);
}
