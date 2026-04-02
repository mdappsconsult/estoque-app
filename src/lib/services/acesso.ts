import { supabase } from '@/lib/supabase';
import { Usuario } from '@/types/database';

type CredencialOperacional = {
  login: string;
  senha: string;
  nome: string;
  telefone: string;
  perfil: Usuario['perfil'];
  /** Para OPERATOR_STORE: nome do cadastro em `locais` (loja ativa). */
  lojaPadraoNome?: string;
};

const CREDENCIAIS_OPERACIONAIS: CredencialOperacional[] = [
  {
    login: 'leonardo',
    senha: '123456',
    nome: 'Leonardo',
    telefone: '550000000001',
    // OPERATOR_WAREHOUSE: compatível com o CHECK do Postgres no Supabase (sem migration).
    // Rotas de motorista também liberam OPERATOR_WAREHOUSE em permissions.ts.
    perfil: 'OPERATOR_WAREHOUSE',
  },
  {
    login: 'marco',
    senha: '654321',
    nome: 'Marco',
    telefone: '550000000002',
    perfil: 'ADMIN_MASTER',
  },
  {
    login: 'ludmilla',
    senha: '123456',
    nome: 'Ludmilla',
    telefone: '550000000003',
    perfil: 'MANAGER',
  },
  {
    login: 'joana',
    senha: '123456',
    nome: 'Joana',
    telefone: '550000000004',
    perfil: 'OPERATOR_STORE',
    lojaPadraoNome: 'Loja Paraiso',
  },
  {
    login: 'simone',
    senha: '123456',
    nome: 'Simone',
    telefone: '550000000005',
    perfil: 'OPERATOR_STORE',
    lojaPadraoNome: 'Loja Teste',
  },
  {
    login: 'luciene',
    senha: '382941',
    nome: 'Luciene',
    telefone: '550000000011',
    perfil: 'OPERATOR_STORE',
    lojaPadraoNome: 'Loja JK',
  },
  {
    login: 'francisca',
    senha: '574028',
    nome: 'Francisca',
    telefone: '550000000012',
    perfil: 'OPERATOR_STORE',
    lojaPadraoNome: 'Loja Delivery',
  },
  {
    login: 'julia',
    senha: '619357',
    nome: 'Júlia',
    telefone: '550000000013',
    perfil: 'OPERATOR_STORE',
    lojaPadraoNome: 'Loja Santa Cruz',
  },
  {
    login: 'lara',
    senha: '805426',
    nome: 'Lara',
    telefone: '550000000014',
    perfil: 'OPERATOR_STORE',
    lojaPadraoNome: 'Loja Imperador Lara',
  },
  {
    login: 'silvania',
    senha: '973518',
    nome: 'Silvania',
    telefone: '550000000015',
    perfil: 'OPERATOR_STORE',
    lojaPadraoNome: 'Loja Jardim Paraíso',
  },
];

/** Ordem na tela de login / documentação: principais contas de desenvolvimento. */
const ORDEM_EXIBICAO_LOGIN = ['leonardo', 'joana', 'ludmilla', 'marco', 'simone'] as const;

const PAPEL_EXIBICAO_LOGIN: Partial<Record<Usuario['perfil'], string>> = {
  OPERATOR_WAREHOUSE: 'indústria',
  OPERATOR_WAREHOUSE_DRIVER: 'indústria + motorista',
  OPERATOR_STORE: 'loja',
  MANAGER: 'gerente',
  ADMIN_MASTER: 'administrador',
  DRIVER: 'motorista',
};

export type LinhaCredencialLogin = {
  nomeExibicao: string;
  login: string;
  senha: string;
  papel: string;
};

/** Lista credenciais (ex.: documentação interna); a UI de `/login` não exibe mais esta lista. */
export function listarCredenciaisParaTelaLogin(): LinhaCredencialLogin[] {
  const byLogin = new Map(CREDENCIAIS_OPERACIONAIS.map((c) => [c.login, c]));
  const prioritized: CredencialOperacional[] = [];
  for (const l of ORDEM_EXIBICAO_LOGIN) {
    const c = byLogin.get(l);
    if (c) prioritized.push(c);
  }
  const emOrdem = new Set<string>([...ORDEM_EXIBICAO_LOGIN]);
  const extras = CREDENCIAIS_OPERACIONAIS.filter((c) => !emOrdem.has(c.login)).sort((a, b) =>
    a.nome.localeCompare(b.nome, 'pt-BR')
  );
  const all = [...prioritized, ...extras];
  return all.map((c) => ({
    nomeExibicao: c.nome,
    login: c.login,
    senha: c.senha,
    papel: PAPEL_EXIBICAO_LOGIN[c.perfil] ?? c.perfil,
  }));
}

function normalizarLogin(login: string): string {
  return login.trim().toLowerCase();
}

function normalizarTexto(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

async function buscarLojaStorePorNome(nome: string): Promise<string | null> {
  const t = nome.trim();
  if (!t) return null;

  const { data: exato } = await supabase
    .from('locais')
    .select('id')
    .eq('tipo', 'STORE')
    .eq('status', 'ativo')
    .eq('nome', t)
    .maybeSingle();
  if (exato?.id) return exato.id;

  const { data: aprox } = await supabase
    .from('locais')
    .select('id')
    .eq('tipo', 'STORE')
    .eq('status', 'ativo')
    .ilike('nome', `%${t}%`)
    .order('nome', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (aprox?.id) return aprox.id;

  // Fallback robusto para variações de acento/espaço no nome da loja.
  const { data: lojas } = await supabase
    .from('locais')
    .select('id, nome')
    .eq('tipo', 'STORE')
    .eq('status', 'ativo')
    .order('nome', { ascending: true });

  const alvo = normalizarTexto(t);
  const exataNormalizada = (lojas || []).find(
    (loja) => normalizarTexto(loja.nome) === alvo
  );
  if (exataNormalizada?.id) return exataNormalizada.id;

  const aproximadaNormalizada = (lojas || []).find((loja) =>
    normalizarTexto(loja.nome).includes(alvo)
  );

  return aproximadaNormalizada?.id || null;
}

async function buscarLocalPadraoOperacional(credencial: CredencialOperacional): Promise<string | null> {
  const { perfil } = credencial;

  // Gerente operacional no estoque/indústria: mesmo local padrão que operador (baixa, perdas, etc.).
  if (
    perfil === 'OPERATOR_WAREHOUSE' ||
    perfil === 'OPERATOR_WAREHOUSE_DRIVER' ||
    perfil === 'MANAGER'
  ) {
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

  if (perfil === 'OPERATOR_STORE') {
    if (credencial.lojaPadraoNome?.trim()) {
      const porNome = await buscarLojaStorePorNome(credencial.lojaPadraoNome);
      if (porNome) return porNome;
      // Para conta com loja explícita (ex.: Joana), não cair em fallback de "primeira loja".
      return null;
    }

    const { data } = await supabase
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

async function upsertUsuarioOperacional(credencial: CredencialOperacional): Promise<Usuario> {
  const localPadraoId = await buscarLocalPadraoOperacional(credencial);

  const { data: existente, error: erroBusca } = await supabase
    .from('usuarios')
    .select('*')
    .eq('telefone', credencial.telefone)
    .maybeSingle();
  if (erroBusca) throw erroBusca;

  if (existente) {
    const localPadraoFinal = localPadraoId;
    if (credencial.perfil === 'OPERATOR_STORE' && !localPadraoFinal) {
      throw new Error(
        `Nao foi possivel identificar a loja padrao de ${credencial.nome}.`
      );
    }

    const { data: atualizado, error: erroAtualizacao } = await supabase
      .from('usuarios')
      .update({
        nome: credencial.nome,
        perfil: credencial.perfil,
        local_padrao_id: localPadraoFinal,
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
