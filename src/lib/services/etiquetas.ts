import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { normalizarDataValidadeSomenteDataParaTimestamptzBr } from '@/lib/datas/validade-producao-br';
import { produtoParticipaSequenciaBaldeLoja } from '@/lib/operacional/produto-sequencia-balde-loja';
import { parseViagemIdDeLoteSep } from '@/lib/separacao/remessa-separacao-ui';
import { Etiqueta, EtiquetaInsert } from '@/types/database';

/** Mesmo critério de `lotes-compra`: produto sem validade no item. */
const DATA_SENTINELA_SEM_VALIDADE = '2999-12-31';

export type UpsertEtiquetaSeparacaoItem = {
  id: string;
  produto_id: string;
  data_validade?: string | null;
};

function dedupeItensSeparacao(itens: UpsertEtiquetaSeparacaoItem[]): UpsertEtiquetaSeparacaoItem[] {
  const m = new Map<string, UpsertEtiquetaSeparacaoItem>();
  for (const x of itens) {
    const id = String(x.id || '').trim();
    if (!id) continue;
    m.set(id, x);
  }
  return [...m.values()];
}

function validadeItemParaEtiqueta(item: UpsertEtiquetaSeparacaoItem): string {
  const v = item.data_validade != null ? String(item.data_validade).trim() : '';
  if (!v) return DATA_SENTINELA_SEM_VALIDADE;
  return normalizarDataValidadeSomenteDataParaTimestamptzBr(v);
}

const CHUNK_TRANSF_SEP_DESTINO = 200;
const CHUNK_TRANSFERENCIA_IDS_IN = 120;

async function destinoPorItemIdViagemSep(
  client: SupabaseClient,
  viagemId: string,
  itemIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const want = new Set(itemIds.filter(Boolean));
  if (!viagemId || want.size === 0) return map;

  const { data: trs, error: e1 } = await client
    .from('transferencias')
    .select('id, destino_id')
    .eq('tipo', 'WAREHOUSE_STORE')
    .eq('viagem_id', viagemId);
  if (e1) throw e1;

  const tidToDest = new Map<string, string>();
  for (const t of (trs ?? []) as { id: string; destino_id: string | null }[]) {
    const d = t.destino_id != null ? String(t.destino_id).trim() : '';
    if (d) tidToDest.set(String(t.id), d);
  }
  if (tidToDest.size === 0) return map;

  const transIds = [...tidToDest.keys()];
  for (let i = 0; i < transIds.length; i += CHUNK_TRANSF_SEP_DESTINO) {
    const slice = transIds.slice(i, i + CHUNK_TRANSF_SEP_DESTINO);
    const { data: ti, error: e2 } = await client
      .from('transferencia_itens')
      .select('item_id, transferencia_id')
      .in('transferencia_id', slice);
    if (e2) throw e2;
    for (const row of ti || []) {
      const r = row as { item_id?: string; transferencia_id?: string };
      const iid = String(r.item_id || '').trim();
      const tid = String(r.transferencia_id || '').trim();
      if (!iid || !want.has(iid)) continue;
      const d = tidToDest.get(tid);
      if (d) map.set(iid, d);
    }
  }
  return map;
}

function destinoBaldeSepParaItem(
  itemId: string,
  destinoPorItem: Map<string, string>,
  fallbackDestino: string | null
): string | null {
  const d = destinoPorItem.get(itemId)?.trim();
  if (d) return d;
  const fb = fallbackDestino?.trim();
  return fb || null;
}

async function reservarBlocoSequenciaBaldePorLoja(
  client: SupabaseClient,
  localDestinoId: string,
  quantidade: number
): Promise<number> {
  const { error: eAdj } = await client.rpc('ajustar_sequencia_balde_loja_ao_max_etiquetas', {
    p_local_destino_id: localDestinoId,
  });
  if (eAdj) throw eAdj;

  const { data: primeiroRaw, error: rpcErr } = await client.rpc('reservar_sequencia_balde_loja', {
    p_local_destino_id: localDestinoId,
    p_quantidade: quantidade,
  });
  if (rpcErr) throw rpcErr;
  const primeiro =
    typeof primeiroRaw === 'number'
      ? primeiroRaw
      : typeof primeiroRaw === 'string'
        ? parseInt(primeiroRaw, 10)
        : NaN;
  if (!Number.isFinite(primeiro)) {
    throw new Error('Falha ao reservar sequência de balde para a loja (RPC inválida).');
  }
  return primeiro;
}

type LinhaMergeSep = {
  produto_id: string;
  data_validade: string;
  data_producao: string;
  impressa: boolean;
  lote: string;
  numero_sequencia_loja: number | null;
  lote_producao_numero: number | null;
  sequencia_no_lote_producao: number | null;
  data_lote_producao: string | null;
  num_baldes_lote_producao: number | null;
};

type BaselineEtiquetaRow = {
  id: string;
  produto_id: string;
  data_validade: string;
  data_producao: string;
  impressa: boolean;
  numero_sequencia_loja: number | null;
  lote: string | null;
  lote_producao_numero: number | null;
  sequencia_no_lote_producao: number | null;
  data_lote_producao: string | null;
  num_baldes_lote_producao: number | null;
};

const CHUNK_ITENS_META_LOTE_PROD = 400;

export type MetaLoteProducaoPorItem = {
  lote_producao_numero: number | null;
  sequencia_no_lote_producao: number | null;
  data_lote_producao: string | null;
  num_baldes_lote_producao: number | null;
};

/**
 * Monta número do lote de produção, sequência k/N e data do lançamento a partir de `itens` + `producoes`.
 * Usado quando a linha em `etiquetas` (SEP) ainda não copiou esses campos — típico de balde vindo de produção na indústria.
 */
export async function carregarMetadadosLoteProducaoPorItemIds(
  itemIds: string[],
  client: SupabaseClient = supabase
): Promise<Map<string, MetaLoteProducaoPorItem>> {
  const out = new Map<string, MetaLoteProducaoPorItem>();
  const uniq = [...new Set(itemIds.map((x) => String(x || '').trim()).filter(Boolean))];
  if (uniq.length === 0) return out;

  type ItemLinha = { id: string; producao_id: string | null; sequencia_no_lote_producao: number | null };
  const porId = new Map<string, ItemLinha>();
  for (let i = 0; i < uniq.length; i += CHUNK_ITENS_META_LOTE_PROD) {
    const slice = uniq.slice(i, i + CHUNK_ITENS_META_LOTE_PROD);
    const { data, error } = await client
      .from('itens')
      .select('id, producao_id, sequencia_no_lote_producao')
      .in('id', slice);
    if (error) throw error;
    for (const row of data || []) {
      const r = row as ItemLinha;
      porId.set(String(r.id), r);
    }
  }

  const pids = [
    ...new Set(
      [...porId.values()]
        .map((r) => r.producao_id)
        .filter((x): x is string => Boolean(x && String(x).trim()))
    ),
  ];
  const prodPorId = new Map<
    string,
    { id: string; numero_lote_producao: number; quantidade: number; num_baldes: number; created_at: string }
  >();
  const chunkPr = 120;
  for (let i = 0; i < pids.length; i += chunkPr) {
    const slice = pids.slice(i, i + chunkPr);
    const { data, error } = await client
      .from('producoes')
      .select('id, numero_lote_producao, quantidade, num_baldes, created_at')
      .in('id', slice);
    if (error) throw error;
    for (const row of data || []) {
      const pr = row as {
        id: string;
        numero_lote_producao: number;
        quantidade: number;
        num_baldes: number;
        created_at: string;
      };
      prodPorId.set(String(pr.id), pr);
    }
  }

  for (const id of uniq) {
    const ir = porId.get(id);
    if (!ir) continue;
    const seqRaw = ir.sequencia_no_lote_producao;
    const seq =
      seqRaw != null && Number.isFinite(Number(seqRaw)) ? Number(seqRaw) : null;
    const pid = ir.producao_id != null ? String(ir.producao_id).trim() : '';
    if (!pid) {
      out.set(id, {
        lote_producao_numero: null,
        sequencia_no_lote_producao: seq,
        data_lote_producao: null,
        num_baldes_lote_producao: null,
      });
      continue;
    }
    const pr = prodPorId.get(pid);
    const q = pr != null ? Number(pr.quantidade) : NaN;
    const nb = pr != null ? Number(pr.num_baldes) : NaN;
    const nTotal =
      Number.isFinite(q) && q > 0 ? q : Number.isFinite(nb) && nb > 0 ? nb : null;
    const nLote =
      pr != null && Number.isFinite(Number(pr.numero_lote_producao))
        ? Number(pr.numero_lote_producao)
        : null;
    out.set(id, {
      lote_producao_numero: nLote,
      sequencia_no_lote_producao: seq,
      data_lote_producao: pr?.created_at != null ? String(pr.created_at) : null,
      num_baldes_lote_producao: nTotal,
    });
  }

  return out;
}

/**
 * Preenche campos de lote de produção na lista (prévia/impressão) quando vieram vazios em `etiquetas`.
 */
export async function aplicarMetadadosLoteProducaoNasRows<
  T extends {
    id: string;
    lote_producao_numero?: number | null;
    sequencia_no_lote_producao?: number | null;
    data_lote_producao?: string | null;
    num_baldes_lote_producao?: number | null;
  },
>(rows: T[], client: SupabaseClient = supabase): Promise<T[]> {
  const faltando = rows.filter(
    (r) =>
      r.lote_producao_numero == null ||
      r.sequencia_no_lote_producao == null ||
      r.num_baldes_lote_producao == null
  );
  if (faltando.length === 0) return rows;
  const meta = await carregarMetadadosLoteProducaoPorItemIds(
    faltando.map((r) => r.id),
    client
  );
  return rows.map((r) => {
    const m = meta.get(r.id);
    if (!m) return r;
    return {
      ...r,
      lote_producao_numero: r.lote_producao_numero ?? m.lote_producao_numero,
      sequencia_no_lote_producao: r.sequencia_no_lote_producao ?? m.sequencia_no_lote_producao,
      data_lote_producao: r.data_lote_producao ?? m.data_lote_producao,
      num_baldes_lote_producao: r.num_baldes_lote_producao ?? m.num_baldes_lote_producao,
    };
  });
}

/**
 * Garante linhas em `etiquetas` (id = id do item) para itens da separação indústria → loja.
 * - `impresso_agora`: marca impressa (fluxo "Imprimir etiquetas").
 * - `manter_impressa_se_existir`: novo registro sai impressa=false; se já existir, não zera impressa=true.
 * - `local_destino_id`: loja de destino; em lotes **não-SEP** é obrigatória para novos números. Em **SEP-…** é usada como fallback quando a viagem ainda não tem `transferencias` (ex.: upsert antes da remessa) ou para itens sem vínculo na transferência.
 * - Lotes **SEP-…**: `numero_sequencia_loja` por **loja de destino**, contínua entre remessas (`reservar_sequencia_balde_loja` + alinhamento ao máximo já gravado). Destino por item vem da transferência `WAREHOUSE_STORE` da viagem; ordem estável por `item_id`. Números já gravados são preservados.
 * - Lotes **SEPARACAO-LOJA** (ou outros): mesma sequência por loja via RPC (sem o ajuste por máximo de etiquetas, fluxo legado).
 * Retorna mapa id do item → número exibido na etiqueta (ou null).
 */
export async function upsertEtiquetasSeparacaoLoja(
  itens: UpsertEtiquetaSeparacaoItem[],
  options: {
    lote: string;
    mode: 'impresso_agora' | 'manter_impressa_se_existir';
    local_destino_id?: string | null;
  },
  client: SupabaseClient = supabase
): Promise<Map<string, number | null>> {
  const numerosPorItemId = new Map<string, number | null>();
  const itensUnicos = dedupeItensSeparacao(itens);
  if (itensUnicos.length === 0) return numerosPorItemId;

  const loteNorm = options.lote.trim();
  const isLoteSep = loteNorm.toUpperCase().startsWith('SEP-');
  const destino = options.local_destino_id?.trim() || null;

  const ids = itensUnicos.map((i) => i.id);

  const baselineById = new Map<string, BaselineEtiquetaRow>();
  const chunkBas = 400;
  for (let i = 0; i < ids.length; i += chunkBas) {
    const slice = ids.slice(i, i + chunkBas);
    const { data, error } = await client
      .from('etiquetas')
      .select(
        'id, produto_id, data_validade, data_producao, impressa, numero_sequencia_loja, lote, lote_producao_numero, sequencia_no_lote_producao, data_lote_producao, num_baldes_lote_producao'
      )
      .in('id', slice)
      .eq('excluida', false);
    if (error) throw error;
    for (const row of data || []) {
      const r = row as Record<string, unknown>;
      const nSeq = r.numero_sequencia_loja;
      const nLoteP = r.lote_producao_numero;
      const nSeqL = r.sequencia_no_lote_producao;
      const nBaldes = r.num_baldes_lote_producao;
      baselineById.set(String(r.id), {
        id: String(r.id),
        produto_id: String(r.produto_id),
        data_validade: String(r.data_validade),
        data_producao: String(r.data_producao),
        impressa: Boolean(r.impressa),
        numero_sequencia_loja:
          nSeq != null && Number.isFinite(Number(nSeq)) ? Number(nSeq) : null,
        lote: (r.lote as string | null) ?? null,
        lote_producao_numero:
          nLoteP != null && Number.isFinite(Number(nLoteP)) ? Number(nLoteP) : null,
        sequencia_no_lote_producao:
          nSeqL != null && Number.isFinite(Number(nSeqL)) ? Number(nSeqL) : null,
        data_lote_producao: r.data_lote_producao != null ? String(r.data_lote_producao) : null,
        num_baldes_lote_producao:
          nBaldes != null && Number.isFinite(Number(nBaldes)) ? Number(nBaldes) : null,
      });
    }
  }

  const produtoIds = [...new Set(itensUnicos.map((i) => i.produto_id))];

  const produtosPorId = new Map<string, { origem: 'COMPRA' | 'PRODUCAO' | 'AMBOS'; nome: string }>();
  const chunkProd = 120;
  for (let i = 0; i < produtoIds.length; i += chunkProd) {
    const slice = produtoIds.slice(i, i + chunkProd);
    const { data, error } = await client.from('produtos').select('id, origem, nome').in('id', slice);
    if (error) throw error;
    for (const row of data || []) {
      produtosPorId.set(row.id as string, {
        origem: row.origem as 'COMPRA' | 'PRODUCAO' | 'AMBOS',
        nome: String(row.nome || ''),
      });
    }
  }

  const impressaPorId = new Map<string, boolean>();
  if (options.mode === 'manter_impressa_se_existir') {
    const chunkSize = 500;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const slice = ids.slice(i, i + chunkSize);
      const { data, error } = await client
        .from('etiquetas')
        .select('id, impressa')
        .in('id', slice)
        .eq('excluida', false);
      if (error) throw error;
      (data || []).forEach((row: { id: string; impressa: boolean }) => {
        impressaPorId.set(row.id, row.impressa === true);
      });
    }
  }

  const itemEhBalde = (produtoId: string) => {
    const p = produtosPorId.get(produtoId);
    if (!p) return false;
    return produtoParticipaSequenciaBaldeLoja(p);
  };

  const agora = new Date().toISOString();

  if (isLoteSep) {
    const merge = new Map<string, LinhaMergeSep>();
    for (const item of itensUnicos) {
      const b = baselineById.get(item.id);
      const baselineLote = b?.lote != null ? String(b.lote).trim() : '';
      const mesmoLoteAtivo = baselineLote === loteNorm;
      const impressa =
        options.mode === 'impresso_agora'
          ? true
          : mesmoLoteAtivo && impressaPorId.get(item.id) === true;
      const nSeqBalde =
        b?.numero_sequencia_loja != null && Number.isFinite(Number(b.numero_sequencia_loja))
          ? Number(b.numero_sequencia_loja)
          : null;
      merge.set(item.id, {
        produto_id: item.produto_id,
        data_validade: validadeItemParaEtiqueta(item),
        data_producao: b?.data_producao ? String(b.data_producao) : agora,
        impressa,
        lote: loteNorm,
        numero_sequencia_loja: nSeqBalde,
        lote_producao_numero: b?.lote_producao_numero ?? null,
        sequencia_no_lote_producao: b?.sequencia_no_lote_producao ?? null,
        data_lote_producao: b?.data_lote_producao ?? null,
        num_baldes_lote_producao: b?.num_baldes_lote_producao ?? null,
      });
    }

    const idsEnriquecer = [...merge.keys()].filter((id) => {
      const m = merge.get(id)!;
      return (
        m.lote_producao_numero == null ||
        m.sequencia_no_lote_producao == null ||
        m.num_baldes_lote_producao == null
      );
    });
    if (idsEnriquecer.length > 0) {
      const metaPorItem = await carregarMetadadosLoteProducaoPorItemIds(idsEnriquecer, client);
      for (const id of idsEnriquecer) {
        const m = merge.get(id);
        const meta = metaPorItem.get(id);
        if (!m || !meta) continue;
        merge.set(id, {
          ...m,
          lote_producao_numero: m.lote_producao_numero ?? meta.lote_producao_numero,
          sequencia_no_lote_producao: m.sequencia_no_lote_producao ?? meta.sequencia_no_lote_producao,
          data_lote_producao: m.data_lote_producao ?? meta.data_lote_producao,
          num_baldes_lote_producao: m.num_baldes_lote_producao ?? meta.num_baldes_lote_producao,
        });
      }
    }

    const vid = parseViagemIdDeLoteSep(loteNorm);
    const destinoPorItem = vid
      ? await destinoPorItemIdViagemSep(client, vid, [...merge.keys()])
      : new Map<string, string>();

    const baldeIds = [...merge.keys()]
      .filter((id) => itemEhBalde(merge.get(id)!.produto_id))
      .sort((a, b) => a.localeCompare(b));

    const seqPorId = new Map<string, number>();
    const idsSemNumeroPorDestino = new Map<string, string[]>();

    for (const id of baldeIds) {
      const m = merge.get(id)!;
      const existente = m.numero_sequencia_loja;
      if (existente != null && Number.isFinite(existente)) {
        seqPorId.set(id, existente);
        continue;
      }
      const lojaDest = destinoBaldeSepParaItem(id, destinoPorItem, destino);
      if (!lojaDest) continue;
      const arr = idsSemNumeroPorDestino.get(lojaDest) ?? [];
      arr.push(id);
      idsSemNumeroPorDestino.set(lojaDest, arr);
    }

    const destinosOrdenados = [...idsSemNumeroPorDestino.keys()].sort((a, b) =>
      a.localeCompare(b)
    );
    for (const lojaDest of destinosOrdenados) {
      const idsSem = (idsSemNumeroPorDestino.get(lojaDest) ?? []).sort((a, b) =>
        a.localeCompare(b)
      );
      if (idsSem.length === 0) continue;
      const primeiro = await reservarBlocoSequenciaBaldePorLoja(client, lojaDest, idsSem.length);
      idsSem.forEach((id, idx) => seqPorId.set(id, primeiro + idx));
    }

    const rows: EtiquetaInsert[] = [...merge.entries()].map(([id, m]) => ({
      id,
      produto_id: m.produto_id,
      data_producao: m.data_producao,
      data_validade: m.data_validade,
      lote: m.lote,
      impressa: m.impressa,
      excluida: false,
      numero_sequencia_loja: itemEhBalde(m.produto_id) ? (seqPorId.get(id) ?? null) : null,
      lote_producao_numero: m.lote_producao_numero,
      sequencia_no_lote_producao: m.sequencia_no_lote_producao,
      data_lote_producao: m.data_lote_producao,
      num_baldes_lote_producao: m.num_baldes_lote_producao,
    }));

    const upsertChunk = 200;
    for (let i = 0; i < rows.length; i += upsertChunk) {
      const chunk = rows.slice(i, i + upsertChunk);
      const { error } = await client.from('etiquetas').upsert(chunk, { onConflict: 'id' });
      if (error) throw error;
    }

    for (const item of itensUnicos) {
      const m = merge.get(item.id);
      if (!m) {
        numerosPorItemId.set(item.id, null);
        continue;
      }
      numerosPorItemId.set(
        item.id,
        itemEhBalde(m.produto_id) ? (seqPorId.get(item.id) ?? null) : null
      );
    }
    return numerosPorItemId;
  }

  const numeroExistentePorId = new Map<string, number | null>();
  for (const id of ids) {
    const n = baselineById.get(id)?.numero_sequencia_loja;
    numeroExistentePorId.set(id, n != null && Number.isFinite(Number(n)) ? Number(n) : null);
  }

  const idsPrecisamNumero: string[] = [];
  for (const item of itensUnicos) {
    if (!itemEhBalde(item.produto_id)) {
      numerosPorItemId.set(item.id, null);
      continue;
    }
    const existente = numeroExistentePorId.get(item.id);
    if (existente != null) {
      numerosPorItemId.set(item.id, existente);
      continue;
    }
    numerosPorItemId.set(item.id, null);
    idsPrecisamNumero.push(item.id);
  }

  const idsPrecisamUnicos = [...new Set(idsPrecisamNumero)].sort((a, b) => a.localeCompare(b));

  if (idsPrecisamUnicos.length > 0 && destino) {
    const { data: primeiroRaw, error: rpcErr } = await client.rpc('reservar_sequencia_balde_loja', {
      p_local_destino_id: destino,
      p_quantidade: idsPrecisamUnicos.length,
    });
    if (rpcErr) throw rpcErr;
    const primeiro =
      typeof primeiroRaw === 'number'
        ? primeiroRaw
        : typeof primeiroRaw === 'string'
          ? parseInt(primeiroRaw, 10)
          : NaN;
    if (!Number.isFinite(primeiro)) {
      throw new Error('Falha ao reservar sequência de balde para a loja (RPC inválida).');
    }
    idsPrecisamUnicos.forEach((id, idx) => {
      const n = primeiro + idx;
      numerosPorItemId.set(id, n);
    });
  }

  const rows: EtiquetaInsert[] = itensUnicos.map((item) => {
    const validade = validadeItemParaEtiqueta(item);
    const b = baselineById.get(item.id);
    const baselineLote = b?.lote != null ? String(b.lote).trim() : '';
    const mesmoLoteAtivo = baselineLote === loteNorm;
    const impressa =
      options.mode === 'impresso_agora'
        ? true
        : mesmoLoteAtivo && impressaPorId.get(item.id) === true;

    return {
      id: item.id,
      produto_id: item.produto_id,
      data_producao: b?.data_producao ? String(b.data_producao) : agora,
      data_validade: validade,
      lote: options.lote,
      impressa,
      excluida: false,
      numero_sequencia_loja: numerosPorItemId.get(item.id) ?? null,
      lote_producao_numero: b?.lote_producao_numero ?? null,
      sequencia_no_lote_producao: b?.sequencia_no_lote_producao ?? null,
      data_lote_producao: b?.data_lote_producao ?? null,
      num_baldes_lote_producao: b?.num_baldes_lote_producao ?? null,
    };
  });

  const upsertChunk = 200;
  for (let i = 0; i < rows.length; i += upsertChunk) {
    const chunk = rows.slice(i, i + upsertChunk);
    const { error } = await client.from('etiquetas').upsert(chunk, { onConflict: 'id' });
    if (error) throw error;
  }

  return numerosPorItemId;
}

/**
 * Recria/atualiza linhas em `etiquetas` para um lote `SEP-{viagem_id}` a partir de `transferencia_itens`.
 * Útil quando a remessa existe em `transferencias` mas não há etiquetas ativas (falha antiga, exclusão em massa ou ajuste manual no banco).
 */
export async function sincronizarEtiquetasRemessaPorLoteSep(
  loteSep: string,
  client: SupabaseClient = supabase
): Promise<number> {
  const viagemId = parseViagemIdDeLoteSep(loteSep);
  if (!viagemId) {
    throw new Error('Lote inválido: use o formato SEP-{id da viagem}.');
  }

  const { data: trs, error: e1 } = await client
    .from('transferencias')
    .select('id, destino_id, created_at')
    .eq('tipo', 'WAREHOUSE_STORE')
    .eq('viagem_id', viagemId)
    .order('created_at', { ascending: false });

  if (e1) throw e1;
  const candidatas = (trs ?? []) as { id: string; destino_id: string; created_at: string }[];
  if (candidatas.length === 0) {
    throw new Error('Nenhuma transferência indústria → loja encontrada para este lote.');
  }

  const destinosDistintos = new Set(
    candidatas.map((c) => (c.destino_id != null ? String(c.destino_id).trim() : '')).filter(Boolean)
  );
  if (destinosDistintos.size > 1) {
    throw new Error(
      'Esta viagem tem transferências com lojas de destino diferentes. Corrija no cadastro antes de sincronizar etiquetas.'
    );
  }
  const destinoId = candidatas[0]?.destino_id ?? null;

  const idsTr = candidatas.map((t) => t.id);
  const { data: titens, error: e2 } = await client
    .from('transferencia_itens')
    .select('item_id')
    .in('transferencia_id', idsTr);
  if (e2) throw e2;

  const itemIds = [...new Set((titens || []).map((r) => r.item_id as string).filter(Boolean))];
  if (itemIds.length === 0) {
    throw new Error('Esta remessa não tem unidades vinculadas em transferência.');
  }

  const itensRows: { id: string; produto_id: string; data_validade: string | null }[] = [];
  const chunkIn = 100;
  for (let i = 0; i < itemIds.length; i += chunkIn) {
    const slice = itemIds.slice(i, i + chunkIn);
    const { data: chunk, error: e3 } = await client
      .from('itens')
      .select('id, produto_id, data_validade')
      .in('id', slice);
    if (e3) throw e3;
    for (const row of chunk || []) {
      itensRows.push({
        id: row.id as string,
        produto_id: row.produto_id as string,
        data_validade: (row.data_validade as string | null) ?? null,
      });
    }
  }
  if (itensRows.length === 0) {
    throw new Error('Unidades (itens) da remessa não foram encontradas.');
  }
  if (itensRows.length !== itemIds.length) {
    throw new Error(
      `Unidades da remessa incompletas: ${itensRows.length} de ${itemIds.length} encontradas em itens (confira vínculos em transferencia_itens).`
    );
  }

  const payload: UpsertEtiquetaSeparacaoItem[] = itensRows.map((row) => ({
    id: row.id,
    produto_id: row.produto_id,
    data_validade: row.data_validade,
  }));

  await upsertEtiquetasSeparacaoLoja(
    payload,
    { lote: loteSep.trim(), mode: 'manter_impressa_se_existir', local_destino_id: destinoId },
    client
  );
  return payload.length;
}

/**
 * IDs de unidades (`itens.id`) na remessa SEP: distintos em `transferencia_itens` para as
 * transferências `WAREHOUSE_STORE` da viagem. Ordem estável (UUID) — alinhada ao upsert de sequência de balde.
 *
 * Quando a viagem tiver **mais de uma** remessa matriz→loja (destinos diferentes), passe
 * `opts.destinoLocalId` com o destino da opção selecionada no select — assim a lista não mistura
 * itens de outra loja com o mesmo `SEP-{viagem_id}`.
 */
export async function listarItemIdsRemessaSepOrdenados(
  loteSep: string,
  client: SupabaseClient = supabase,
  opts?: { destinoLocalId?: string | null }
): Promise<string[] | null> {
  const viagemId = parseViagemIdDeLoteSep(loteSep);
  if (!viagemId) return null;
  const { data: trs, error } = await client
    .from('transferencias')
    .select('id, destino_id')
    .eq('tipo', 'WAREHOUSE_STORE')
    .eq('viagem_id', viagemId);
  if (error || !trs?.length) return null;

  const destFiltro = opts?.destinoLocalId?.trim().toLowerCase() || null;
  let idsTr: string[];
  if (destFiltro) {
    idsTr = (trs as { id: string; destino_id?: string | null }[])
      .filter((t) => String(t.destino_id ?? '').trim().toLowerCase() === destFiltro)
      .map((t) => t.id);
    if (idsTr.length === 0) return [];
  } else {
    idsTr = trs.map((t) => (t as { id: string }).id);
  }

  const uniq = new Set<string>();
  for (let i = 0; i < idsTr.length; i += CHUNK_TRANSFERENCIA_IDS_IN) {
    const slice = idsTr.slice(i, i + CHUNK_TRANSFERENCIA_IDS_IN);
    const { data: titens, error: e2 } = await client
      .from('transferencia_itens')
      .select('item_id')
      .in('transferencia_id', slice);
    if (e2) return null;
    for (const r of titens || []) {
      const id = String((r as { item_id?: string }).item_id || '').trim();
      if (id) uniq.add(id);
    }
  }
  return [...uniq].sort((a, b) => a.localeCompare(b));
}

/**
 * Itens distintos em `transferencia_itens` para as transferências WAREHOUSE_STORE da viagem do lote SEP-…
 * (mesma base do resumo «N unidade(s)» em Separar por Loja / envios).
 */
export async function contarUnidadesTransferenciaPorLoteSep(
  loteSep: string,
  client: SupabaseClient = supabase,
  opts?: { destinoLocalId?: string | null }
): Promise<number | null> {
  const ids = await listarItemIdsRemessaSepOrdenados(loteSep, client, opts);
  if (ids == null) return null;
  return ids.length;
}

export interface EtiquetaCompleta extends Etiqueta {
  produto: {
    id: string;
    nome: string;
    medida: string | null;
    unidade_medida: string;
  };
}

// Buscar etiquetas
export async function getEtiquetas(filtros?: {
  impressa?: boolean;
  excluida?: boolean;
  produtoId?: string;
}): Promise<EtiquetaCompleta[]> {
  let query = supabase
    .from('etiquetas')
    .select('*, produto:produtos(id, nome, medida, unidade_medida)')
    .order('created_at', { ascending: false });

  if (filtros?.impressa !== undefined) {
    query = query.eq('impressa', filtros.impressa);
  }
  if (filtros?.excluida !== undefined) {
    query = query.eq('excluida', filtros.excluida);
  }
  if (filtros?.produtoId) {
    query = query.eq('produto_id', filtros.produtoId);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

// Criar etiqueta
export async function createEtiqueta(etiqueta: EtiquetaInsert): Promise<Etiqueta> {
  const { data, error } = await supabase
    .from('etiquetas')
    .insert(etiqueta)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Criar múltiplas etiquetas
export async function createEtiquetas(etiquetas: EtiquetaInsert[]): Promise<Etiqueta[]> {
  const { data, error } = await supabase
    .from('etiquetas')
    .insert(etiquetas)
    .select();

  if (error) throw error;
  return data || [];
}

// Marcar etiqueta como impressa
export async function marcarEtiquetaImpressa(id: string): Promise<void> {
  const { error } = await supabase
    .from('etiquetas')
    .update({ impressa: true })
    .eq('id', id);

  if (error) throw error;
}

// Marcar múltiplas etiquetas como impressas
export async function marcarEtiquetasImpressas(ids: string[]): Promise<void> {
  const { error } = await supabase
    .from('etiquetas')
    .update({ impressa: true })
    .in('id', ids);

  if (error) throw error;
}

// Excluir etiqueta (soft delete)
export async function excluirEtiqueta(id: string): Promise<void> {
  const { error } = await supabase
    .from('etiquetas')
    .update({ excluida: true })
    .eq('id', id);

  if (error) throw error;
}

// Buscar etiquetas próximas do vencimento
export async function getEtiquetasProximasVencimento(dias: number = 7): Promise<EtiquetaCompleta[]> {
  const dataLimite = new Date();
  dataLimite.setDate(dataLimite.getDate() + dias);

  const { data, error } = await supabase
    .from('etiquetas')
    .select('*, produto:produtos(id, nome, medida, unidade_medida)')
    .eq('excluida', false)
    .lte('data_validade', dataLimite.toISOString())
    .gte('data_validade', new Date().toISOString())
    .order('data_validade', { ascending: true });

  if (error) throw error;
  return data || [];
}

// Gerar lote automaticamente
export function gerarLote(): string {
  const data = new Date();
  const ano = data.getFullYear().toString().slice(-2);
  const mes = (data.getMonth() + 1).toString().padStart(2, '0');
  const dia = data.getDate().toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `L${ano}${mes}${dia}${random}`;
}
