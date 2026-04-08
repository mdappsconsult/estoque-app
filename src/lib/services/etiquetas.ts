import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
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

/**
 * Garante linhas em `etiquetas` (id = id do item) para itens da separação indústria → loja.
 * - `impresso_agora`: marca impressa (fluxo "Imprimir etiquetas").
 * - `manter_impressa_se_existir`: novo registro sai impressa=false; se já existir, não zera impressa=true.
 * - `local_destino_id`: loja de destino; baldes (PRODUCAO/AMBOS + nome com «balde») recebem `numero_sequencia_loja` contínuo por loja.
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
  if (itens.length === 0) return numerosPorItemId;

  const ids = itens.map((i) => i.id);
  const produtoIds = [...new Set(itens.map((i) => i.produto_id))];

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
      const { data, error } = await client.from('etiquetas').select('id, impressa').in('id', slice);
      if (error) throw error;
      (data || []).forEach((row: { id: string; impressa: boolean }) => {
        impressaPorId.set(row.id, row.impressa === true);
      });
    }
  }

  const numeroExistentePorId = new Map<string, number | null>();
  const chunkExist = 500;
  for (let i = 0; i < ids.length; i += chunkExist) {
    const slice = ids.slice(i, i + chunkExist);
    const { data, error } = await client
      .from('etiquetas')
      .select('id, numero_sequencia_loja')
      .in('id', slice);
    if (error) throw error;
    for (const row of data || []) {
      const n = row.numero_sequencia_loja;
      numeroExistentePorId.set(
        row.id as string,
        n != null && Number.isFinite(Number(n)) ? Number(n) : null
      );
    }
  }

  const destino = options.local_destino_id?.trim() || null;

  const itemEhBalde = (produtoId: string) => {
    const p = produtosPorId.get(produtoId);
    if (!p) return false;
    return produtoParticipaSequenciaBaldeLoja(p);
  };

  const idsPrecisamNumero: string[] = [];
  for (const item of itens) {
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

  idsPrecisamNumero.sort((a, b) => a.localeCompare(b));

  if (idsPrecisamNumero.length > 0 && destino) {
    const { data: primeiroRaw, error: rpcErr } = await client.rpc('reservar_sequencia_balde_loja', {
      p_local_destino_id: destino,
      p_quantidade: idsPrecisamNumero.length,
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
    idsPrecisamNumero.forEach((id, idx) => {
      const n = primeiro + idx;
      numerosPorItemId.set(id, n);
    });
  }

  const agora = new Date().toISOString();
  const rows: EtiquetaInsert[] = itens.map((item) => {
    const validade =
      item.data_validade && String(item.data_validade).trim()
        ? item.data_validade!
        : DATA_SENTINELA_SEM_VALIDADE;
    const impressa =
      options.mode === 'impresso_agora'
        ? true
        : impressaPorId.get(item.id) === true;

    return {
      id: item.id,
      produto_id: item.produto_id,
      data_producao: agora,
      data_validade: validade,
      lote: options.lote,
      impressa,
      excluida: false,
      numero_sequencia_loja: numerosPorItemId.get(item.id) ?? null,
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
    .select('id, destino_id')
    .eq('tipo', 'WAREHOUSE_STORE')
    .eq('viagem_id', viagemId)
    .limit(1);

  if (e1) throw e1;
  const tr0 = trs?.[0] as { id: string; destino_id: string } | undefined;
  const transferenciaId = tr0?.id;
  const destinoId = tr0?.destino_id ?? null;
  if (!transferenciaId) {
    throw new Error('Nenhuma transferência indústria → loja encontrada para este lote.');
  }

  const { data: titens, error: e2 } = await client
    .from('transferencia_itens')
    .select('item_id')
    .eq('transferencia_id', transferenciaId);
  if (e2) throw e2;

  const itemIds = (titens || []).map((r) => r.item_id as string).filter(Boolean);
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
