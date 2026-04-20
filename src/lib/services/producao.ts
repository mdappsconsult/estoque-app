import { supabase } from '@/lib/supabase';
import { registrarAuditoria } from './auditoria';
import { gerarTokenQR, gerarTokenShort } from './itens';
import { gerarLote } from './etiquetas';
import { EtiquetaInsert, Item } from '@/types/database';
import { recalcularEstoqueProduto, recalcularEstoqueProdutos } from './estoque-sync';
import { garantirItensDisponiveisNoLocal } from './lotes-compra';
import { calcularDataValidadeYmdAposDiasCorridosBr } from '@/lib/datas/validade-producao-br';

export interface ConsumoProducaoLinha {
  produtoId: string;
  quantidade: number;
}

interface RegistrarProducaoInput {
  produtoId: string;
  /** Número de baldes (1 balde = 1 unidade com QR do acabado nesta versão). */
  numBaldes: number;
  localId: string;
  consumos: ConsumoProducaoLinha[];
  dataValidade?: string | null;
  diasValidade?: number | null;
  observacoes?: string | null;
  usuarioId: string;
  responsavelNome: string;
}

/**
 * Select PostgREST para histórico na tela de produção (GET curto).
 * Sem embed `itens(count)` nem `producao_consumo_itens(count)`: contagens em consultas separadas com `.in()` em **lotes pequenos** (URL GET longa → `TypeError: Failed to fetch` em proxy/mobile).
 */
/** Sem `numero_lote_producao`: em bancos sem migração `20260420120000_…` a coluna não existe em `producoes` — o lote exibido vem de `etiquetas.lote_producao_numero` quando houver. */
export const HISTORICO_PRODUCAO_SELECT = [
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

/** Máx. de UUIDs por `.in()` para evitar URL de GET gigante (414 / falha de rede). */
const HISTORICO_IN_CHUNK = 20;

export type ProducaoHistoricoResumo = {
  id: string;
  createdAt: string;
  produtoNome: string;
  localNome: string;
  /** `null` se o banco não tiver rastreio de lote ou etiqueta ainda não tiver número. */
  numeroLoteProducao: number | null;
  numBaldes: number;
  quantidade: number;
  qrsAcabado: number;
  /** `false` se a contagem por rede falhou (lista ainda aparece; «QRs acabado» fica N/D). */
  contagemAcabadoDisponivel: boolean;
  qrsInsumoBaixados: number;
  /** `false` se a contagem de insumos por rede falhou parcial ou totalmente. */
  contagemInsumoDisponivel: boolean;
  responsavel: string;
  /** QRs gerados do acabado batem com baldes e quantidade gravada. */
  coerenteBaldes: boolean;
};

/**
 * Conta QRs do acabado por produção e tenta obter número do lote via primeira etiqueta do lote (mesmo dado da face impressa).
 * Não propaga erro de rede: retorna `contagemAcabadoDisponivel: false` para o chamador tratar.
 */
async function agregarItensAcabadoPorProducaoIds(producaoIds: string[]): Promise<{
  qrsPorProducao: Map<string, number>;
  loteNumeroPorProducao: Map<string, number | null>;
  contagemAcabadoDisponivel: boolean;
}> {
  const qrsPorProducao = new Map<string, number>();
  const primeiroItemIdPorProducao = new Map<string, string>();
  const loteNumeroPorProducao = new Map<string, number | null>();
  let contagemAcabadoDisponivel = true;

  const ids = [...new Set(producaoIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) {
    return { qrsPorProducao, loteNumeroPorProducao, contagemAcabadoDisponivel: true };
  }

  for (let i = 0; i < ids.length; i += HISTORICO_IN_CHUNK) {
    const slice = ids.slice(i, i + HISTORICO_IN_CHUNK);
    try {
      const { data, error } = await supabase.from('itens').select('id, producao_id').in('producao_id', slice);
      if (error) {
        console.warn('[historico-producao] itens:', error.message);
        contagemAcabadoDisponivel = false;
        continue;
      }
      for (const row of data || []) {
        const pid = (row as { producao_id?: string | null }).producao_id;
        const iid = (row as { id?: string }).id;
        if (!pid || !iid) continue;
        qrsPorProducao.set(pid, (qrsPorProducao.get(pid) || 0) + 1);
        if (!primeiroItemIdPorProducao.has(pid)) primeiroItemIdPorProducao.set(pid, iid);
      }
    } catch (e) {
      console.warn('[historico-producao] itens rede:', e);
      contagemAcabadoDisponivel = false;
    }
  }

  const itemIds = [...new Set(primeiroItemIdPorProducao.values())];
  if (itemIds.length === 0) {
    return { qrsPorProducao, loteNumeroPorProducao, contagemAcabadoDisponivel };
  }

  const lotePorItemId = new Map<string, number | null>();
  try {
    for (let j = 0; j < itemIds.length; j += HISTORICO_IN_CHUNK) {
      const sliceE = itemIds.slice(j, j + HISTORICO_IN_CHUNK);
      const { data: ets, error: errE } = await supabase
        .from('etiquetas')
        .select('id, lote_producao_numero')
        .in('id', sliceE);
      if (errE) {
        console.warn('[historico-producao] etiquetas:', errE.message);
        break;
      }
      for (const e of ets || []) {
        const er = e as { id?: string; lote_producao_numero?: number | string | null };
        if (!er.id) continue;
        const raw = er.lote_producao_numero;
        const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10);
        lotePorItemId.set(er.id, Number.isFinite(n) ? n : null);
      }
    }
  } catch (e) {
    console.warn('[historico-producao] etiquetas rede:', e);
  }

  for (const [pid, itemId] of primeiroItemIdPorProducao) {
    loteNumeroPorProducao.set(pid, lotePorItemId.get(itemId) ?? null);
  }

  return { qrsPorProducao, loteNumeroPorProducao, contagemAcabadoDisponivel };
}

async function contarInsumosPorProducaoIds(producaoIds: string[]): Promise<{
  insumosPorProducao: Map<string, number>;
  contagemInsumoDisponivel: boolean;
}> {
  const insumosPorProducao = new Map<string, number>();
  let contagemInsumoDisponivel = true;
  const ids = [...new Set(producaoIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) {
    return { insumosPorProducao, contagemInsumoDisponivel: true };
  }

  for (let i = 0; i < ids.length; i += HISTORICO_IN_CHUNK) {
    const slice = ids.slice(i, i + HISTORICO_IN_CHUNK);
    try {
      const { data, error } = await supabase
        .from('producao_consumo_itens')
        .select('producao_id')
        .in('producao_id', slice);
      if (error) {
        console.warn('[historico-producao] consumo_itens:', error.message);
        contagemInsumoDisponivel = false;
        continue;
      }
      for (const row of data || []) {
        const pid = (row as { producao_id?: string | null }).producao_id;
        if (!pid) continue;
        insumosPorProducao.set(pid, (insumosPorProducao.get(pid) || 0) + 1);
      }
    } catch (e) {
      console.warn('[historico-producao] consumo_itens rede:', e);
      contagemInsumoDisponivel = false;
    }
  }

  return { insumosPorProducao, contagemInsumoDisponivel };
}

export async function mapearHistoricoProducaoRows(
  rows: Record<string, unknown>[]
): Promise<ProducaoHistoricoResumo[]> {
  const ids = rows.map((r) => String(r.id ?? ''));
  const [aggItens, aggInsumo] = await Promise.all([
    agregarItensAcabadoPorProducaoIds(ids),
    contarInsumosPorProducaoIds(ids),
  ]);
  const { qrsPorProducao, loteNumeroPorProducao, contagemAcabadoDisponivel } = aggItens;
  const { insumosPorProducao, contagemInsumoDisponivel } = aggInsumo;

  return rows.map((r) => {
    const produtos = r.produtos as { nome?: string } | null;
    const locais = r.locais as { nome?: string } | null;
    const numBaldes = Math.floor(Number(r.num_baldes ?? 0));
    const quantidade = Math.floor(Number(r.quantidade ?? 0));
    const id = String(r.id);
    const qrsAcabado = qrsPorProducao.get(id) ?? 0;
    const qrsInsumoBaixados = insumosPorProducao.get(id) ?? 0;
    return {
      id,
      createdAt: String(r.created_at ?? ''),
      produtoNome: produtos?.nome?.trim() || '—',
      localNome: locais?.nome?.trim() || '—',
      numeroLoteProducao: loteNumeroPorProducao.get(id) ?? null,
      numBaldes,
      quantidade,
      qrsAcabado,
      contagemAcabadoDisponivel,
      qrsInsumoBaixados,
      contagemInsumoDisponivel,
      responsavel: String(r.responsavel ?? '').trim() || '—',
      coerenteBaldes:
        contagemAcabadoDisponivel &&
        contagemInsumoDisponivel &&
        numBaldes > 0 &&
        qrsAcabado === numBaldes &&
        quantidade === numBaldes,
    };
  });
}

export interface EtiquetaGeradaProducao {
  id: string;
  produtoId: string;
  dataProducao: string;
  dataValidade: string;
  lote: string;
  tokenQr: string;
  tokenShort: string | null;
  numeroLoteProducao: number;
  sequenciaNoLote: number;
  numBaldesLote: number;
  dataLoteProducaoIso: string;
}

function mergeConsumos(linhas: ConsumoProducaoLinha[]): ConsumoProducaoLinha[] {
  const map = new Map<string, number>();
  for (const linha of linhas) {
    const q = linha.quantidade;
    if (!linha.produtoId || !Number.isFinite(q) || q <= 0) continue;
    map.set(linha.produtoId, (map.get(linha.produtoId) || 0) + Math.floor(q));
  }
  return [...map.entries()].map(([produtoId, quantidade]) => ({ produtoId, quantidade }));
}

async function selecionarItensFefo(
  produtoId: string,
  localId: string,
  quantidade: number
): Promise<string[]> {
  const { data, error } = await supabase
    .from('itens')
    .select('id')
    .eq('produto_id', produtoId)
    .eq('local_atual_id', localId)
    .eq('estado', 'EM_ESTOQUE')
    .order('created_at', { ascending: true })
    .limit(quantidade);

  if (error) throw error;
  const rows = data || [];
  if (rows.length < quantidade) {
    throw new Error(
      `Estoque insuficiente para um insumo (produto ${produtoId.slice(0, 8)}…): precisa ${quantidade}, há ${rows.length} unidade(s) no local.`
    );
  }
  return rows.map((r) => r.id);
}

export async function registrarProducaoComItens(input: RegistrarProducaoInput): Promise<EtiquetaGeradaProducao[]> {
  if (input.numBaldes <= 0 || !Number.isInteger(input.numBaldes)) {
    throw new Error('Número de baldes deve ser um inteiro maior que zero');
  }

  const consumosMerged = mergeConsumos(input.consumos);
  if (consumosMerged.length === 0) {
    throw new Error('Informe ao menos um insumo com quantidade utilizada (unidades com QR)');
  }

  for (const c of consumosMerged) {
    if (c.produtoId === input.produtoId) {
      throw new Error('Não use o produto acabado como insumo da mesma produção');
    }
  }

  const dataValidadeCalculada =
    input.dataValidade ||
    (typeof input.diasValidade === 'number'
      ? calcularDataValidadeYmdAposDiasCorridosBr(input.diasValidade)
      : null);
  if (!dataValidadeCalculada) {
    throw new Error('Informe a data de validade ou os dias de validade');
  }

  const quantidadeAcabado = input.numBaldes;

  for (const c of consumosMerged) {
    await garantirItensDisponiveisNoLocal({
      produtoId: c.produtoId,
      localId: input.localId,
      quantidadeNecessaria: c.quantidade,
      usuarioId: input.usuarioId,
    });
  }

  const selecoesPorProduto = await Promise.all(
    consumosMerged.map(async (c) => ({
      produtoId: c.produtoId,
      itemIds: await selecionarItensFefo(c.produtoId, input.localId, c.quantidade),
    }))
  );

  const todosItemIdsConsumidos = selecoesPorProduto.flatMap((s) => s.itemIds);
  const produtosInsumos = [...new Set(consumosMerged.map((c) => c.produtoId))];

  const { data: rpcNumero, error: rpcLoteErr } = await supabase.rpc('reservar_numero_lote_producao', {
    p_produto_id: input.produtoId,
    p_local_id: input.localId,
  });
  if (rpcLoteErr) throw rpcLoteErr;
  const numeroLoteProducao =
    typeof rpcNumero === 'number'
      ? rpcNumero
      : typeof rpcNumero === 'string'
        ? parseInt(rpcNumero, 10)
        : NaN;
  if (!Number.isFinite(numeroLoteProducao)) {
    throw new Error('Falha ao reservar número de lote de produção.');
  }

  const baseProducao = {
    produto_id: input.produtoId,
    quantidade: quantidadeAcabado,
    num_baldes: input.numBaldes,
    local_id: input.localId,
    responsavel: input.responsavelNome,
    observacoes: input.observacoes || null,
  };

  const { data: producaoRow, error: producaoErr } = await supabase
    .from('producoes')
    .insert({
      ...baseProducao,
      registrado_por: input.usuarioId,
      numero_lote_producao: numeroLoteProducao,
    })
    .select('id, created_at, numero_lote_producao')
    .single();

  if (producaoErr) throw producaoErr;
  if (!producaoRow?.id) throw new Error('Resposta inválida ao gravar produção');
  const producaoId = producaoRow.id;
  const dataLoteProducaoIso = String((producaoRow as { created_at?: string }).created_at || '');

  const { error: updErr } = await supabase
    .from('itens')
    .update({ estado: 'BAIXADO' })
    .in('id', todosItemIdsConsumidos);
  if (updErr) throw updErr;

  const baixasPayload = todosItemIdsConsumidos.map((itemId) => ({
    item_id: itemId,
    local_id: input.localId,
    usuario_id: input.usuarioId,
    producao_id: producaoId,
  }));

  const { error: baixasErr } = await supabase.from('baixas').insert(baixasPayload);
  if (baixasErr) throw baixasErr;

  const consumoPayload = todosItemIdsConsumidos.map((itemId) => ({
    producao_id: producaoId,
    item_id: itemId,
  }));
  const { error: consumoErr } = await supabase.from('producao_consumo_itens').insert(consumoPayload);
  if (consumoErr) throw consumoErr;

  await recalcularEstoqueProdutos(produtosInsumos);

  const auditoriaBaixas = todosItemIdsConsumidos.map((itemId) => ({
    usuario_id: input.usuarioId,
    local_id: input.localId,
    acao: 'BAIXA',
    item_id: itemId,
    detalhes: { producao_id: producaoId, motivo: 'consumo_producao' } as Record<string, unknown>,
  }));
  const chunkAud = 80;
  for (let i = 0; i < auditoriaBaixas.length; i += chunkAud) {
    const slice = auditoriaBaixas.slice(i, i + chunkAud);
    const { error: audErr } = await supabase.from('auditoria').insert(slice);
    if (audErr) console.error('Erro ao registrar auditoria de baixas da produção:', audErr);
  }

  const itensAcabado = Array.from({ length: quantidadeAcabado }, (_, idx) => ({
    token_qr: gerarTokenQR(),
    token_short: gerarTokenShort(),
    produto_id: input.produtoId,
    local_atual_id: input.localId,
    estado: 'EM_ESTOQUE' as const,
    data_validade: dataValidadeCalculada,
    data_producao: new Date().toISOString(),
    producao_id: producaoId,
    sequencia_no_lote_producao: idx + 1,
  }));

  const { data: itensCriados, error: itensError } = await supabase.from('itens').insert(itensAcabado).select();
  if (itensError) throw itensError;
  const itensGerados = (itensCriados || []) as Item[];

  const loteProducao = gerarLote();

  const etiquetas: EtiquetaInsert[] = itensGerados.map((item, idx) => ({
    id: item.id,
    produto_id: item.produto_id,
    data_producao: item.data_producao || new Date().toISOString(),
    data_validade: item.data_validade || dataValidadeCalculada,
    lote: loteProducao,
    impressa: false,
    excluida: false,
    lote_producao_numero: numeroLoteProducao,
    sequencia_no_lote_producao: idx + 1,
    data_lote_producao: dataLoteProducaoIso || null,
    num_baldes_lote_producao: quantidadeAcabado,
  }));

  if (etiquetas.length > 0) {
    const { error: etiquetasError } = await supabase.from('etiquetas').insert(etiquetas);
    if (etiquetasError) throw etiquetasError;
  }

  await recalcularEstoqueProduto(input.produtoId);

  await registrarAuditoria({
    usuario_id: input.usuarioId,
    local_id: input.localId,
    acao: 'PRODUCAO',
    detalhes: {
      producao_id: producaoId,
      produto_id: input.produtoId,
      quantidade: quantidadeAcabado,
      num_baldes: input.numBaldes,
      numero_lote_producao: numeroLoteProducao,
      dias_validade: input.diasValidade ?? null,
      data_validade: dataValidadeCalculada,
      consumos: consumosMerged.map((c) => ({ produto_id: c.produtoId, quantidade: c.quantidade })),
      itens_consumidos: todosItemIdsConsumidos.length,
    },
  });

  return itensGerados.map((item, idx) => ({
    id: item.id,
    produtoId: item.produto_id,
    dataProducao: item.data_producao || new Date().toISOString(),
    dataValidade: item.data_validade || dataValidadeCalculada,
    lote: loteProducao,
    tokenQr: item.token_qr,
    tokenShort: item.token_short || null,
    numeroLoteProducao,
    sequenciaNoLote: idx + 1,
    numBaldesLote: quantidadeAcabado,
    dataLoteProducaoIso: dataLoteProducaoIso || new Date().toISOString(),
  }));
}
