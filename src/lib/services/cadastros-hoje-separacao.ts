import { supabase } from '@/lib/supabase';
import { participaReposicaoLoja } from '@/lib/services/reposicao-loja';

/** Início e fim do dia civil no fuso do navegador, em ISO (para filtrar `timestamptz` no Supabase). */
export function intervaloLocalHojeIso(): { inicioIso: string; fimIso: string } {
  const d = new Date();
  const inicio = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const fim = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  return { inicioIso: inicio.toISOString(), fimIso: fim.toISOString() };
}

export type ConfigLojaProdutoHoje = {
  id: string;
  loja_id: string;
  produto_id: string;
  produto_nome: string;
  loja_nome: string;
  ativo_na_loja: boolean;
  estoque_minimo_loja: number;
  created_at: string;
  updated_at: string;
  /** Linha criada hoje vs só atualizada hoje. */
  evento: 'criado_hoje' | 'atualizado_hoje';
};

export type ProdutoNovoHoje = {
  id: string;
  nome: string;
  created_at: string;
  origem: string;
};

export type LojaNovaHoje = {
  id: string;
  nome: string;
  created_at: string;
};

function nomeJoin(v: unknown): string {
  if (!v || typeof v !== 'object') return '—';
  const o = v as { nome?: string };
  return (o.nome && String(o.nome).trim()) || '—';
}

/**
 * Cadastros no Supabase “tocados hoje” que impactam Separar por Loja:
 * - `loja_produtos_config`: criado ou atualizado hoje (mínimo / ativo na loja).
 * - `produtos`: criados hoje e elegíveis para reposição na loja.
 * - `locais` tipo STORE: criados hoje.
 */
export async function buscarCadastrosIndustriaHojeParaSeparacao(opts: {
  lojaDestinoId: string | null;
  inicioIso: string;
  fimIso: string;
}): Promise<{
  configsLoja: ConfigLojaProdutoHoje[];
  produtosNovos: ProdutoNovoHoje[];
  lojasNovas: LojaNovaHoje[];
}> {
  const { lojaDestinoId, inicioIso, fimIso } = opts;

  let qConfig = supabase
    .from('loja_produtos_config')
    .select(
      'id, loja_id, produto_id, ativo_na_loja, estoque_minimo_loja, created_at, updated_at, produto:produtos(nome), loja:locais!loja_id(nome)'
    )
    .or(`created_at.gte.${inicioIso},updated_at.gte.${inicioIso}`)
    .order('updated_at', { ascending: false })
    .limit(lojaDestinoId ? 500 : 120);

  if (lojaDestinoId) {
    qConfig = qConfig.eq('loja_id', lojaDestinoId);
  }

  const [resConfig, resProdutos, resLocais] = await Promise.all([
    qConfig,
    supabase
      .from('produtos')
      .select('id, nome, origem, escopo_reposicao, created_at')
      .gte('created_at', inicioIso)
      .lte('created_at', fimIso)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('locais')
      .select('id, nome, created_at')
      .eq('tipo', 'STORE')
      .gte('created_at', inicioIso)
      .lte('created_at', fimIso)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  if (resConfig.error) throw resConfig.error;
  if (resProdutos.error) throw resProdutos.error;
  if (resLocais.error) throw resLocais.error;

  const configsLoja: ConfigLojaProdutoHoje[] = (resConfig.data || []).map((row) => {
    const created = new Date(row.created_at).getTime() >= new Date(inicioIso).getTime();
    const evento: ConfigLojaProdutoHoje['evento'] = created ? 'criado_hoje' : 'atualizado_hoje';
    return {
      id: row.id,
      loja_id: row.loja_id,
      produto_id: row.produto_id,
      produto_nome: nomeJoin(row.produto),
      loja_nome: nomeJoin(row.loja),
      ativo_na_loja: row.ativo_na_loja,
      estoque_minimo_loja: row.estoque_minimo_loja,
      created_at: row.created_at,
      updated_at: row.updated_at,
      evento,
    };
  });

  const produtosNovos: ProdutoNovoHoje[] = (resProdutos.data || [])
    .filter((p) => participaReposicaoLoja(p.escopo_reposicao, p.origem))
    .map((p) => ({
      id: p.id,
      nome: p.nome,
      created_at: p.created_at,
      origem: p.origem ?? 'AMBOS',
    }));

  const lojasNovas: LojaNovaHoje[] = (resLocais.data || []).map((l) => ({
    id: l.id,
    nome: l.nome,
    created_at: l.created_at,
  }));

  return { configsLoja, produtosNovos, lojasNovas };
}
