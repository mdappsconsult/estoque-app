import { supabase } from '@/lib/supabase';
import { parseViagemIdDeLoteSep } from '@/lib/separacao/remessa-separacao-ui';

export type OpcaoRemessaSepEtiquetas = {
  lote: string;
  created_at: string;
  /** `transferencias.origem_id` quando a meta foi resolvida (filtra remessas «só etiquetas» após enrich). */
  origemLocalId?: string | null;
  /** Preenchido na mesma leitura de `transferencias` + `locais` (padrão «Estoque → Loja X» no select). */
  origemNome?: string;
  destinoNome?: string;
  destinoLocalId?: string | null;
  status?: string;
  /** `created_at` da transferência escolhida (painel / data de referência). */
  transferenciaCreatedAt?: string;
  /** `transferencias.criado_por` distintos nesta viagem (quem registrou a separação). */
  criadoresTransferencia?: string[];
};

export type BuscarOpcoesRemessaSepOpts = {
  origemId?: string | null;
  /** Só remessas em que alguma `transferencias` da viagem foi criada por este usuário (login indústria em Etiquetas). */
  apenasCriadorUsuarioId?: string | null;
};

const LIM_TRANSFERENCIAS_VIAGEM = 200;
const SCAN_ETIQUETAS_LOTES_FALLBACK = 2000;
const MAX_OPCOES_REMESSA_TOTAL = 200;
const CHUNK_VIAGEM_ENRICH = 45;

const SELECT_TRANS_COM_LOCAIS =
  'viagem_id, origem_id, destino_id, created_at, status, tipo, criado_por, origem:locais!origem_id(nome), destino:locais!destino_id(nome)';

type TransRow = {
  viagem_id: string | null;
  origem_id: string | null;
  destino_id: string | null;
  created_at: string | null;
  tipo: string | null;
  status: string | null;
  criado_por: string | null;
  origem: { nome?: string } | null;
  destino: { nome?: string } | null;
};

export const ETIQUETAS_UI_LIMITES_REMESA = {
  maxOpcoesNoSelect: MAX_OPCOES_REMESSA_TOTAL,
  limTransferenciasViagem: LIM_TRANSFERENCIAS_VIAGEM,
  scanEtiquetasFallback: SCAN_ETIQUETAS_LOTES_FALLBACK,
} as const;

function loteCanonicoParaViagem(vidNorm: string): string {
  return `SEP-${vidNorm}`;
}

function nomeLoc(v: { nome?: string } | null | undefined): string {
  return (v && String(v.nome || '').trim()) || '';
}

function escolherMelhorTransferencia(rows: TransRow[]): TransRow | null {
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) =>
    String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))
  );
  const wh = sorted.filter((r) => String(r.tipo ?? '').toUpperCase() === 'WAREHOUSE_STORE');
  return wh[0] ?? sorted[0];
}

function agruparPorViagem(trans: TransRow[]): Map<string, TransRow[]> {
  const m = new Map<string, TransRow[]>();
  for (const t of trans) {
    const vid = String(t.viagem_id ?? '')
      .trim()
      .toLowerCase();
    if (!vid) continue;
    const arr = m.get(vid) ?? [];
    arr.push(t);
    m.set(vid, arr);
  }
  return m;
}

function opcaoDeGrupoViagem(vid: string, rows: TransRow[]): OpcaoRemessaSepEtiquetas {
  const best = escolherMelhorTransferencia(rows);
  if (!best) {
    return {
      lote: loteCanonicoParaViagem(vid),
      created_at: new Date().toISOString(),
    };
  }
  const createdMax = rows
    .map((r) => String(r.created_at ?? ''))
    .sort()
    .reverse()[0];
  const criadoresTransferencia = [
    ...new Set(rows.map((r) => String(r.criado_por ?? '').trim()).filter(Boolean)),
  ];
  return {
    lote: loteCanonicoParaViagem(vid),
    created_at: createdMax || String(best.created_at ?? ''),
    origemLocalId: best.origem_id ?? null,
    origemNome: nomeLoc(best.origem) || 'Origem não informada',
    destinoNome: nomeLoc(best.destino) || 'Destino não informado',
    destinoLocalId: best.destino_id ?? null,
    status: String(best.status ?? ''),
    transferenciaCreatedAt: String(best.created_at ?? ''),
    criadoresTransferencia: criadoresTransferencia.length ? criadoresTransferencia : undefined,
  };
}

function opcoesFromTransRows(trans: TransRow[]): OpcaoRemessaSepEtiquetas[] {
  const grupos = agruparPorViagem(trans);
  return [...grupos.entries()].map(([vid, rows]) => opcaoDeGrupoViagem(vid, rows));
}

function ordenarPorCreatedAtDesc(opcoes: OpcaoRemessaSepEtiquetas[]): OpcaoRemessaSepEtiquetas[] {
  return [...opcoes].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

async function buscarTransPorViagemIds(viagemIds: string[]): Promise<TransRow[]> {
  const out: TransRow[] = [];
  const uniq = [...new Set(viagemIds.filter(Boolean))];
  for (let i = 0; i < uniq.length; i += CHUNK_VIAGEM_ENRICH) {
    const slice = uniq.slice(i, i + CHUNK_VIAGEM_ENRICH);
    const { data, error } = await supabase.from('transferencias').select(SELECT_TRANS_COM_LOCAIS).in('viagem_id', slice);
    if (error) {
      console.warn('etiquetas-opcoes-remessa: transferências por viagem_id:', error.message);
      continue;
    }
    if (data?.length) out.push(...(data as TransRow[]));
  }
  return out;
}

/** Preenche origem/destino para opções vindas só de RPC/etiquetas (fora do top N transferências). */
async function enriquecerOpcoesSemMeta(opcoes: OpcaoRemessaSepEtiquetas[]): Promise<OpcaoRemessaSepEtiquetas[]> {
  const faltandoMeta = opcoes.filter((o) => !o.origemNome);
  if (faltandoMeta.length === 0) return opcoes;

  const ids = [
    ...new Set(
      faltandoMeta.map((o) => parseViagemIdDeLoteSep(o.lote)).filter((x): x is string => Boolean(x))
    ),
  ];
  const trans = await buscarTransPorViagemIds(ids);
  const grupos = agruparPorViagem(trans);
  const metaPorVid = new Map<string, OpcaoRemessaSepEtiquetas>();
  for (const [vid, rows] of grupos) {
    metaPorVid.set(vid, opcaoDeGrupoViagem(vid, rows));
  }

  return opcoes.map((o) => {
    if (o.origemNome) return o;
    const vid = parseViagemIdDeLoteSep(o.lote);
    if (!vid) return o;
    const fill = metaPorVid.get(vid);
    if (!fill?.origemNome) return o;
    return {
      ...o,
      origemLocalId: fill.origemLocalId ?? null,
      origemNome: fill.origemNome,
      destinoNome: fill.destinoNome,
      destinoLocalId: fill.destinoLocalId ?? null,
      status: fill.status,
      transferenciaCreatedAt: fill.transferenciaCreatedAt,
      created_at: o.created_at > fill.created_at ? o.created_at : fill.created_at,
      criadoresTransferencia: fill.criadoresTransferencia?.length
        ? fill.criadoresTransferencia
        : o.criadoresTransferencia,
    };
  });
}

/** Garante `criadoresTransferencia` para filtro por criador (opções vindas só do RPC/scan às vezes já têm origem). */
async function enriquecerCriadoresTransferencia(
  opcoes: OpcaoRemessaSepEtiquetas[]
): Promise<OpcaoRemessaSepEtiquetas[]> {
  const faltando = opcoes.filter((o) => !o.criadoresTransferencia?.length);
  if (faltando.length === 0) return opcoes;

  const ids = [
    ...new Set(
      faltando.map((o) => parseViagemIdDeLoteSep(o.lote)).filter((x): x is string => Boolean(x))
    ),
  ];
  const trans = await buscarTransPorViagemIds(ids);
  const grupos = agruparPorViagem(trans);
  const mapCriadores = new Map<string, string[]>();
  for (const [vid, rows] of grupos) {
    const c = [...new Set(rows.map((r) => String(r.criado_por ?? '').trim()).filter(Boolean))];
    if (c.length) mapCriadores.set(vid, c);
  }

  return opcoes.map((o) => {
    if (o.criadoresTransferencia?.length) return o;
    const vid = parseViagemIdDeLoteSep(o.lote);
    const c = vid ? mapCriadores.get(vid) : undefined;
    return c?.length ? { ...o, criadoresTransferencia: c } : o;
  });
}

/**
 * Lista remessas SEP para o select em `/etiquetas`.
 * **Origem e destino** vêm do mesmo select em `transferencias` + embed em `locais`; opções extras (RPC/etiquetas)
 * são enriquecidas numa segunda ida ao banco por `viagem_id` (não dependem do efeito na página).
 */
export async function buscarOpcoesRemessaSepParaEtiquetas(
  opts?: BuscarOpcoesRemessaSepOpts
): Promise<OpcaoRemessaSepEtiquetas[]> {
  const origem = opts?.origemId?.trim() || null;

  let q = supabase
    .from('transferencias')
    .select(SELECT_TRANS_COM_LOCAIS)
    .eq('tipo', 'WAREHOUSE_STORE')
    .not('viagem_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(LIM_TRANSFERENCIAS_VIAGEM);

  if (origem) q = q.eq('origem_id', origem);

  const { data: trans, error: eTrans } = await q;
  if (eTrans) throw eTrans;

  const opcoes = opcoesFromTransRows((trans || []) as TransRow[]);
  let ordenadas = ordenarPorCreatedAtDesc(opcoes);
  const seenVid = new Set(
    ordenadas.map((o) => parseViagemIdDeLoteSep(o.lote)).filter((x): x is string => Boolean(x))
  );

  if (ordenadas.length < MAX_OPCOES_REMESSA_TOTAL) {
    const { data: rpcRows, error: rpcErr } = await supabase.rpc('etiquetas_lotes_sep_recentes', {
      p_limit: MAX_OPCOES_REMESSA_TOTAL,
    });

    if (!rpcErr && Array.isArray(rpcRows) && rpcRows.length > 0) {
      for (const row of rpcRows as { lote?: string; created_at?: string }[]) {
        if (ordenadas.length >= MAX_OPCOES_REMESSA_TOTAL) break;
        const lRaw = row.lote != null ? String(row.lote).trim() : '';
        if (!lRaw) continue;
        const vid = parseViagemIdDeLoteSep(lRaw);
        if (vid && seenVid.has(vid)) continue;
        if (vid) seenVid.add(vid);
        /* Mantém o texto de `etiquetas.lote` para bater com `.eq('lote', …)` na listagem. */
        ordenadas.push({
          lote: lRaw,
          created_at: String(row.created_at ?? ''),
        });
      }
    } else {
      const { data: slim, error: eSlim } = await supabase
        .from('etiquetas')
        .select('lote, created_at')
        .eq('excluida', false)
        .like('lote', 'SEP-%')
        .order('created_at', { ascending: false })
        .limit(SCAN_ETIQUETAS_LOTES_FALLBACK);

      if (eSlim) throw eSlim;

      for (const row of slim || []) {
        if (ordenadas.length >= MAX_OPCOES_REMESSA_TOTAL) break;
        const lRaw = row.lote as string | null;
        if (!lRaw) continue;
        const vid = parseViagemIdDeLoteSep(lRaw);
        if (vid && seenVid.has(vid)) continue;
        if (vid) seenVid.add(vid);
        ordenadas.push({
          lote: lRaw,
          created_at: String(row.created_at ?? ''),
        });
      }
    }
  }

  ordenadas = ordenarPorCreatedAtDesc(ordenadas);
  if (ordenadas.length > MAX_OPCOES_REMESSA_TOTAL) {
    ordenadas = ordenadas.slice(0, MAX_OPCOES_REMESSA_TOTAL);
  }

  ordenadas = await enriquecerOpcoesSemMeta(ordenadas);

  /** RPC / scan em `etiquetas` injetavam viagens de qualquer origem mesmo com `origemId` na 1ª query. */
  if (origem) {
    const origemNorm = origem.toLowerCase();
    ordenadas = ordenadas.filter(
      (o) => (o.origemLocalId || '').trim().toLowerCase() === origemNorm
    );
  }

  const filtroCriador = opts?.apenasCriadorUsuarioId?.trim();
  if (filtroCriador) {
    ordenadas = await enriquecerCriadoresTransferencia(ordenadas);
    const uid = filtroCriador.toLowerCase();
    ordenadas = ordenadas.filter((o) =>
      (o.criadoresTransferencia ?? []).some((id) => String(id).trim().toLowerCase() === uid)
    );
  }

  return ordenadas;
}
