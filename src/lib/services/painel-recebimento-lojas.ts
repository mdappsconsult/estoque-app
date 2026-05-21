import { supabase } from '@/lib/supabase';
import { inicioDiaBrIso } from '@/lib/datas/inicio-dia-br';
import type { Transferencia } from '@/types/database';

export type TipoFluxoPainel = 'sep' | 'gripagem_balde' | 'balde_avulso' | 'loja_loja';

export interface RemessaPainelRow {
  id: string;
  tipoFluxo: TipoFluxoPainel;
  tipoTransferencia: string;
  status: Transferencia['status'];
  origemId: string;
  destinoId: string;
  origemNome: string;
  destinoNome: string;
  produtoNome: string | null;
  criadoEm: string;
  totalEsperado: number;
  bipados: number;
  faltam: number;
  pct: number;
  ultimoBipEm: string | null;
  concluida: boolean;
}

export interface OperadorBipRow {
  usuarioId: string;
  nome: string;
  quantidade: number;
  ultimoBipEm: string | null;
}

export interface LojaPainelRow {
  lojaId: string;
  lojaNome: string;
  remessas: RemessaPainelRow[];
  totalEsperado: number;
  bipados: number;
  faltam: number;
  remessasAbertas: number;
  operadores: OperadorBipRow[];
  temPendencia: boolean;
}

export interface PainelRecebimentoResumo {
  consultadoEm: string;
  janela: 'hoje' | '48h';
  desdeIso: string;
  lojas: LojaPainelRow[];
  totais: {
    lojasAtivas: number;
    lojasComPendencia: number;
    remessasAbertas: number;
    totalEsperado: number;
    bipados: number;
    faltam: number;
    remessasConcluidas: number;
  };
  operadoresRede: OperadorBipRow[];
}

function normUm<T extends { nome?: string }>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function classificarFluxo(row: {
  tipo: string;
  modo_bip_loja?: boolean | null;
  quantidade_demandada?: number | null;
}): TipoFluxoPainel {
  if (row.modo_bip_loja) {
    const q = Math.floor(Number(row.quantidade_demandada ?? 0));
    return q > 1 ? 'gripagem_balde' : 'balde_avulso';
  }
  if (row.tipo === 'STORE_STORE') return 'loja_loja';
  return 'sep';
}

type TransRaw = {
  id: string;
  tipo: string;
  status: Transferencia['status'];
  origem_id: string;
  destino_id: string;
  created_at: string;
  modo_bip_loja?: boolean | null;
  quantidade_demandada?: number | null;
  produto_demandado_id?: string | null;
  origem: { nome?: string } | { nome?: string }[] | null;
  destino: { nome?: string } | { nome?: string }[] | null;
  produto: { nome?: string } | { nome?: string }[] | null;
};

type TiAgg = {
  total: number;
  bipados: number;
  ultimoBipEm: string | null;
  porOperador: Map<string, { nome: string; qtd: number; ultimo: string | null }>;
};

async function agregarItensRemessas(ids: string[]): Promise<Map<string, TiAgg>> {
  const map = new Map<string, TiAgg>();
  if (ids.length === 0) return map;

  type Linha = {
    transferencia_id: string;
    recebido: boolean;
    recebido_em: string | null;
    recebido_por_usuario_id: string | null;
    recebedor: { nome?: string } | { nome?: string }[] | null;
  };

  for (let i = 0; i < ids.length; i += 40) {
    const slice = ids.slice(i, i + 40);
    const { data, error } = await supabase
      .from('transferencia_itens')
      .select(
        'transferencia_id, recebido, recebido_em, recebido_por_usuario_id, recebedor:usuarios!recebido_por_usuario_id(nome)'
      )
      .in('transferencia_id', slice);
    if (error) throw error;

    for (const raw of (data || []) as Linha[]) {
      const tid = raw.transferencia_id;
      let agg = map.get(tid);
      if (!agg) {
        agg = { total: 0, bipados: 0, ultimoBipEm: null, porOperador: new Map() };
        map.set(tid, agg);
      }
      agg.total += 1;
      if (raw.recebido) {
        agg.bipados += 1;
        const em = raw.recebido_em;
        if (em && (!agg.ultimoBipEm || em > agg.ultimoBipEm)) {
          agg.ultimoBipEm = em;
        }
        const uid = raw.recebido_por_usuario_id?.trim();
        if (uid) {
          const rec = normUm(raw.recebedor);
          const nome = rec?.nome?.trim() || 'Operador';
          const op = agg.porOperador.get(uid) || { nome, qtd: 0, ultimo: null };
          op.qtd += 1;
          if (em && (!op.ultimo || em > op.ultimo)) op.ultimo = em;
          agg.porOperador.set(uid, op);
        }
      }
    }
  }
  return map;
}

function montarRemessa(
  raw: TransRaw,
  agg: TiAgg | undefined,
  lojasNome: Map<string, string>
): RemessaPainelRow | null {
  const fluxo = classificarFluxo(raw);
  const destinoNome =
    normUm(raw.destino)?.nome?.trim() || lojasNome.get(raw.destino_id) || 'Loja';
  const origemNome = normUm(raw.origem)?.nome?.trim() || 'Origem';
  const produtoNome = normUm(raw.produto)?.nome?.trim() || null;

  let totalEsperado: number;
  if (fluxo === 'gripagem_balde') {
    totalEsperado = Math.max(1, Math.floor(Number(raw.quantidade_demandada ?? 0)));
  } else if (fluxo === 'balde_avulso') {
    totalEsperado = 1;
  } else {
    totalEsperado = agg?.total ?? 0;
  }

  const bipados =
    fluxo === 'gripagem_balde' || fluxo === 'balde_avulso'
      ? agg?.bipados ?? 0
      : agg?.bipados ?? 0;

  if (fluxo === 'sep' && totalEsperado === 0) {
    return null;
  }

  const faltam = Math.max(0, totalEsperado - bipados);
  const concluida = raw.status === 'DELIVERED' || raw.status === 'DIVERGENCE';
  const pct =
    totalEsperado > 0 ? Math.min(100, Math.round((bipados / totalEsperado) * 100)) : 0;

  return {
    id: raw.id,
    tipoFluxo: fluxo,
    tipoTransferencia: raw.tipo,
    status: raw.status,
    origemId: raw.origem_id,
    destinoId: raw.destino_id,
    origemNome,
    destinoNome,
    produtoNome,
    criadoEm: raw.created_at,
    totalEsperado,
    bipados,
    faltam,
    pct,
    ultimoBipEm: agg?.ultimoBipEm ?? null,
    concluida,
  };
}

function operadoresDeRemessas(
  remessas: RemessaPainelRow[],
  aggs: Map<string, TiAgg>
): OperadorBipRow[] {
  const map = new Map<string, OperadorBipRow>();
  for (const r of remessas) {
    const agg = aggs.get(r.id);
    if (!agg) continue;
    for (const [uid, op] of agg.porOperador) {
      const atual = map.get(uid);
      if (!atual) {
        map.set(uid, {
          usuarioId: uid,
          nome: op.nome,
          quantidade: op.qtd,
          ultimoBipEm: op.ultimo,
        });
      } else {
        atual.quantidade += op.qtd;
        if (op.ultimo && (!atual.ultimoBipEm || op.ultimo > atual.ultimoBipEm)) {
          atual.ultimoBipEm = op.ultimo;
        }
      }
    }
  }
  return [...map.values()].sort((a, b) => b.quantidade - a.quantidade);
}

function operadoresRede(lojas: LojaPainelRow[]): OperadorBipRow[] {
  const map = new Map<string, OperadorBipRow>();
  for (const loja of lojas) {
    for (const op of loja.operadores) {
      const atual = map.get(op.usuarioId);
      if (!atual) {
        map.set(op.usuarioId, { ...op });
      } else {
        atual.quantidade += op.quantidade;
        if (
          op.ultimoBipEm &&
          (!atual.ultimoBipEm || op.ultimoBipEm > atual.ultimoBipEm)
        ) {
          atual.ultimoBipEm = op.ultimoBipEm;
        }
      }
    }
  }
  return [...map.values()].sort((a, b) => b.quantidade - a.quantidade);
}

/**
 * Painel gerencial: entradas nas lojas (SEP, gripagem de balde, avulsos) com progresso de bip.
 */
export async function listarPainelRecebimentoLojas(
  janela: 'hoje' | '48h' = 'hoje'
): Promise<PainelRecebimentoResumo> {
  const desdeIso =
    janela === 'hoje'
      ? inicioDiaBrIso()
      : new Date(Date.now() - 48 * 3600 * 1000).toISOString();

  const { data: lojasData, error: eLojas } = await supabase
    .from('locais')
    .select('id, nome')
    .eq('tipo', 'STORE')
    .eq('status', 'ativo')
    .order('nome', { ascending: true });
  if (eLojas) throw eLojas;

  const lojasNome = new Map<string, string>();
  for (const l of lojasData || []) {
    lojasNome.set((l as { id: string }).id, (l as { nome: string }).nome);
  }

  const { data: transData, error: eTrans } = await supabase
    .from('transferencias')
    .select(
      `id, tipo, status, origem_id, destino_id, created_at, modo_bip_loja, quantidade_demandada, produto_demandado_id,
       origem:locais!origem_id(nome), destino:locais!destino_id(nome),
       produto:produtos!produto_demandado_id(nome)`
    )
    .gte('created_at', desdeIso)
    .in('status', ['AWAITING_ACCEPT', 'ACCEPTED', 'IN_TRANSIT', 'DELIVERED', 'DIVERGENCE'])
    .order('created_at', { ascending: false });
  if (eTrans) throw eTrans;

  const transRows = (transData || []) as TransRaw[];
  const transLoja = transRows.filter((t) => lojasNome.has(t.destino_id));
  const ids = transLoja.map((t) => t.id);
  const aggs = await agregarItensRemessas(ids);

  const porLoja = new Map<string, RemessaPainelRow[]>();
  for (const raw of transLoja) {
    const remessa = montarRemessa(raw, aggs.get(raw.id), lojasNome);
    if (!remessa) continue;
    const lista = porLoja.get(raw.destino_id) || [];
    lista.push(remessa);
    porLoja.set(raw.destino_id, lista);
  }

  const lojas: LojaPainelRow[] = [];
  for (const [lojaId, nome] of lojasNome) {
    const remessas = (porLoja.get(lojaId) || []).sort(
      (a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime()
    );
    if (remessas.length === 0) continue;

    const totalEsperado = remessas.reduce((s, r) => s + r.totalEsperado, 0);
    const bipados = remessas.reduce((s, r) => s + r.bipados, 0);
    const faltam = remessas.reduce((s, r) => s + r.faltam, 0);
    const remessasAbertas = remessas.filter((r) => !r.concluida).length;

    lojas.push({
      lojaId,
      lojaNome: nome,
      remessas,
      totalEsperado,
      bipados,
      faltam,
      remessasAbertas,
      operadores: operadoresDeRemessas(remessas, aggs),
      temPendencia: faltam > 0 && remessas.some((r) => !r.concluida),
    });
  }

  lojas.sort((a, b) => {
    if (a.temPendencia !== b.temPendencia) return a.temPendencia ? -1 : 1;
    return b.faltam - a.faltam;
  });

  const totais = {
    lojasAtivas: lojas.length,
    lojasComPendencia: lojas.filter((l) => l.temPendencia).length,
    remessasAbertas: lojas.reduce((s, l) => s + l.remessasAbertas, 0),
    totalEsperado: lojas.reduce((s, l) => s + l.totalEsperado, 0),
    bipados: lojas.reduce((s, l) => s + l.bipados, 0),
    faltam: lojas.reduce((s, l) => s + l.faltam, 0),
    remessasConcluidas: lojas.reduce(
      (s, l) => s + l.remessas.filter((r) => r.concluida).length,
      0
    ),
  };

  return {
    consultadoEm: new Date().toISOString(),
    janela,
    desdeIso,
    lojas,
    totais,
    operadoresRede: operadoresRede(lojas),
  };
}
