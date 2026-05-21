import { supabase } from '@/lib/supabase';
import { DATA_VALIDADE_LIMITE_SENTINELA } from './validades-itens';
import { registrarAuditoria } from './auditoria';
import { recalcularEstoqueProduto } from './estoque-sync';
import { getItemPorCodigoEscaneado, type ItemCompleto } from './itens';
import { assertItensSemVinculoRemessaAberta } from './transferencias';

export type RetornoBaldeStatus = 'AGUARDANDO_TRIAGEM' | 'APROVADO_ENVASE';

export type TriagemRetornoDestino = 'ENVASE' | 'DESCARTE';

export interface ColetarBaldeVencidoInput {
  codigoQr: string;
  lojaId: string;
  localIndustriaId: string;
  usuarioId: string;
}

export interface ColetarBaldeVencidoResultado {
  itemId: string;
  tokenShort: string | null;
  tokenQr: string;
  produtoNome: string;
  lojaNome: string;
  dataValidade: string | null;
}

export interface TriagemBaldeRetornoInput {
  codigoQr: string;
  destino: TriagemRetornoDestino;
  localIndustriaId: string;
  usuarioId: string;
  motivoDescarte?: string;
}

export interface TriagemBaldeRetornoResultado {
  itemId: string;
  tokenShort: string | null;
  tokenQr: string;
  produtoNome: string;
  lojaOrigemId: string | null;
  lojaOrigemNome: string;
  dataValidade: string | null;
  destino: TriagemRetornoDestino;
}

export interface FilaTriagemRow {
  id: string;
  token_qr: string;
  token_short: string | null;
  data_validade: string | null;
  produto_nome: string;
  loja_origem_id: string | null;
  loja_origem_nome: string;
}

const MOTIVOS_DESCARTE_PADRAO = [
  'Produto vencido',
  'Embalagem danificada',
  'Contaminação',
  'Quebra de temperatura',
  'Outro',
] as const;

export { MOTIVOS_DESCARTE_PADRAO };

function ehProdutoBalde(nomeProduto: string | undefined | null): boolean {
  return /balde/i.test(nomeProduto ?? '');
}

export function itemVencido(dataValidade: string | null | undefined): boolean {
  if (!dataValidade) return false;
  const t = new Date(dataValidade).getTime();
  const limite = new Date(DATA_VALIDADE_LIMITE_SENTINELA).getTime();
  if (!Number.isFinite(t) || t >= limite) return false;
  return t < Date.now();
}

/** Conta baldes vencidos EM_ESTOQUE na loja (nome contém «balde»). */
export async function contarBaldesVencidosNaLoja(lojaId: string): Promise<number> {
  const agoraIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('itens')
    .select('id, produto:produtos(nome)')
    .eq('estado', 'EM_ESTOQUE')
    .eq('local_atual_id', lojaId)
    .is('retorno_balde_status', null)
    .not('data_validade', 'is', null)
    .lt('data_validade', DATA_VALIDADE_LIMITE_SENTINELA)
    .lt('data_validade', agoraIso)
    .limit(500);

  if (error) throw error;

  return (data || []).filter((row) => {
    const p = Array.isArray(row.produto) ? row.produto[0] : row.produto;
    return /balde/i.test((p as { nome?: string } | null)?.nome ?? '');
  }).length;
}

/**
 * Coleta na loja: balde vencido sai da loja e entra no estoque da indústria aguardando triagem.
 */
export async function coletarBaldeVencidoNaLoja(
  input: ColetarBaldeVencidoInput
): Promise<ColetarBaldeVencidoResultado> {
  const { codigoQr, lojaId, localIndustriaId, usuarioId } = input;

  if (!lojaId?.trim()) throw new Error('Selecione a loja.');
  if (!localIndustriaId?.trim()) throw new Error('Selecione o local da indústria.');

  const item = await getItemPorCodigoEscaneado(codigoQr.trim());
  if (!item) throw new Error('QR não encontrado. Confira o código ou a rede.');

  if (!ehProdutoBalde(item.produto?.nome)) {
    throw new Error('Este QR não é de um produto balde.');
  }

  if (item.estado !== 'EM_ESTOQUE') {
    throw new Error(`Este balde não está em estoque (${item.estado}).`);
  }

  if (item.local_atual_id !== lojaId) {
    const nomeLoja = item.local_atual?.nome ?? 'outro local';
    throw new Error(`Este balde não está nesta loja — está em «${nomeLoja}».`);
  }

  if (item.retorno_balde_status) {
    throw new Error(
      'Este balde já entrou no fluxo de retorno (coleta ou triagem). Confira o status no rastreio.'
    );
  }

  if (!itemVencido(item.data_validade)) {
    throw new Error(
      'Só baldes vencidos podem ser coletados. A validade deste QR ainda não passou no sistema.'
    );
  }

  await assertItensSemVinculoRemessaAberta([item.id], supabase);

  const lojaNome = item.local_atual?.nome ?? 'Loja';

  const { error: eUp } = await supabase
    .from('itens')
    .update({
      local_atual_id: localIndustriaId,
      estado: 'EM_ESTOQUE',
      retorno_balde_status: 'AGUARDANDO_TRIAGEM',
    })
    .eq('id', item.id);

  if (eUp) throw eUp;

  await recalcularEstoqueProduto(item.produto_id);

  await registrarAuditoria({
    usuario_id: usuarioId,
    local_id: localIndustriaId,
    item_id: item.id,
    acao: 'COLETA_BALDE_VENCIDO_LOJA',
    detalhes: {
      loja_origem_id: lojaId,
      loja_origem_nome: lojaNome,
      produto_id: item.produto_id,
      data_validade: item.data_validade,
      token_short: item.token_short,
    },
  });

  return {
    itemId: item.id,
    tokenShort: item.token_short,
    tokenQr: item.token_qr,
    produtoNome: item.produto?.nome ?? 'Balde',
    lojaNome,
    dataValidade: item.data_validade,
  };
}

async function buscarLojaOrigemColeta(itemId: string): Promise<{ id: string | null; nome: string }> {
  const { data, error } = await supabase
    .from('auditoria')
    .select('detalhes')
    .eq('item_id', itemId)
    .eq('acao', 'COLETA_BALDE_VENCIDO_LOJA')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  const det = (data?.detalhes || {}) as Record<string, unknown>;
  return {
    id: (det.loja_origem_id as string) ?? null,
    nome: (det.loja_origem_nome as string) ?? '—',
  };
}

async function validarItemParaTriagem(item: ItemCompleto, localIndustriaId: string): Promise<void> {
  if (!ehProdutoBalde(item.produto?.nome)) {
    throw new Error('Este QR não é de um produto balde.');
  }

  if (item.estado !== 'EM_ESTOQUE') {
    throw new Error(`Este balde não está em estoque (${item.estado}).`);
  }

  const local = item.local_atual;
  if (!local?.id || local.tipo !== 'WAREHOUSE') {
    throw new Error(
      'Este balde ainda não está na indústria. Colete na loja em «Coleta — baldes vencidos» primeiro.'
    );
  }

  if (local.id !== localIndustriaId) {
    throw new Error(`Este balde está em «${local.nome}», não no armazém selecionado.`);
  }

  if (item.retorno_balde_status !== 'AGUARDANDO_TRIAGEM') {
    if (item.retorno_balde_status === 'APROVADO_ENVASE') {
      throw new Error('Este balde já foi aprovado para caixa. Use «Envase — caixas».');
    }
    if (!item.retorno_balde_status) {
      throw new Error('Este balde não veio de coleta de retorno — não entra na triagem.');
    }
    throw new Error('Status de retorno inválido para triagem.');
  }
}

/**
 * Triagem na indústria: aprovar para envase ou descartar (balde já coletado e no estoque da indústria).
 */
export async function triagemBaldeRetornoLoja(
  input: TriagemBaldeRetornoInput
): Promise<TriagemBaldeRetornoResultado> {
  const { codigoQr, destino, localIndustriaId, usuarioId, motivoDescarte } = input;

  if (!localIndustriaId?.trim()) throw new Error('Selecione o local da indústria.');

  if (destino === 'DESCARTE') {
    if (!motivoDescarte?.trim()) throw new Error('Informe o motivo do descarte.');
  }

  const item = await getItemPorCodigoEscaneado(codigoQr.trim());
  if (!item) throw new Error('QR não encontrado. Confira o código ou a rede.');

  await validarItemParaTriagem(item, localIndustriaId);

  const lojaOrigem = await buscarLojaOrigemColeta(item.id);

  if (destino === 'ENVASE') {
    const { error: eUp } = await supabase
      .from('itens')
      .update({ retorno_balde_status: 'APROVADO_ENVASE' })
      .eq('id', item.id);
    if (eUp) throw eUp;

    await registrarAuditoria({
      usuario_id: usuarioId,
      local_id: localIndustriaId,
      item_id: item.id,
      acao: 'TRIAGEM_BALDE_APROVADO_ENVASE',
      detalhes: {
        loja_origem_id: lojaOrigem.id,
        loja_origem_nome: lojaOrigem.nome,
        produto_id: item.produto_id,
        data_validade: item.data_validade,
      },
    });

    return {
      itemId: item.id,
      tokenShort: item.token_short,
      tokenQr: item.token_qr,
      produtoNome: item.produto?.nome ?? 'Balde',
      lojaOrigemId: lojaOrigem.id,
      lojaOrigemNome: lojaOrigem.nome,
      dataValidade: item.data_validade,
      destino,
    };
  }

  const motivoFinal = motivoDescarte!.trim();

  const { error: eDesc } = await supabase
    .from('itens')
    .update({ estado: 'DESCARTADO', retorno_balde_status: null })
    .eq('id', item.id);
  if (eDesc) throw eDesc;

  await recalcularEstoqueProduto(item.produto_id);

  await supabase.from('perdas').insert({
    item_id: item.id,
    motivo: motivoFinal,
    local_id: localIndustriaId,
    usuario_id: usuarioId,
  });

  await registrarAuditoria({
    usuario_id: usuarioId,
    local_id: localIndustriaId,
    item_id: item.id,
    acao: 'TRIAGEM_BALDE_DESCARTE',
    detalhes: {
      loja_origem_id: lojaOrigem.id,
      loja_origem_nome: lojaOrigem.nome,
      motivo: motivoFinal,
      produto_id: item.produto_id,
      data_validade: item.data_validade,
    },
  });

  return {
    itemId: item.id,
    tokenShort: item.token_short,
    tokenQr: item.token_qr,
    produtoNome: item.produto?.nome ?? 'Balde',
    lojaOrigemId: lojaOrigem.id,
    lojaOrigemNome: lojaOrigem.nome,
    dataValidade: item.data_validade,
    destino,
  };
}

/** Fila de baldes aguardando triagem no armazém da indústria. */
export async function listarFilaAguardandoTriagem(
  localIndustriaId: string,
  limite = 100
): Promise<FilaTriagemRow[]> {
  const { data, error } = await supabase
    .from('itens')
    .select('id, token_qr, token_short, data_validade, produto:produtos(nome)')
    .eq('local_atual_id', localIndustriaId)
    .eq('estado', 'EM_ESTOQUE')
    .eq('retorno_balde_status', 'AGUARDANDO_TRIAGEM')
    .order('data_validade', { ascending: true })
    .limit(limite);

  if (error) throw error;

  const rows = (data || []) as Array<{
    id: string;
    token_qr: string;
    token_short: string | null;
    data_validade: string | null;
    produto: { nome: string } | { nome: string }[] | null;
  }>;

  const out: FilaTriagemRow[] = [];
  for (const row of rows) {
    const prod = Array.isArray(row.produto) ? row.produto[0] : row.produto;
    const loja = await buscarLojaOrigemColeta(row.id);
    out.push({
      id: row.id,
      token_qr: row.token_qr,
      token_short: row.token_short,
      data_validade: row.data_validade,
      produto_nome: prod?.nome ?? 'Balde',
      loja_origem_id: loja.id,
      loja_origem_nome: loja.nome,
    });
  }
  return out;
}

export interface LinhaHistoricoRetorno {
  id: string;
  acao: string;
  item_id: string | null;
  created_at: string;
  detalhes: Record<string, unknown> | null;
}

const ACOES_HISTORICO_RETORNO = [
  'COLETA_BALDE_VENCIDO_LOJA',
  'TRIAGEM_BALDE_APROVADO_ENVASE',
  'TRIAGEM_BALDE_DESCARTE',
] as const;

export async function listarHistoricoRetornoRecentes(
  localIndustriaId: string,
  limite = 40
): Promise<LinhaHistoricoRetorno[]> {
  const { data, error } = await supabase
    .from('auditoria')
    .select('id, acao, item_id, created_at, detalhes')
    .eq('local_id', localIndustriaId)
    .in('acao', [...ACOES_HISTORICO_RETORNO])
    .order('created_at', { ascending: false })
    .limit(limite);

  if (error) throw error;
  return (data || []) as LinhaHistoricoRetorno[];
}

/** Valida se balde pode entrar no envase (NULL = produção direta; APROVADO_ENVASE = retorno triado). */
export function baldePermitidoNoEnvase(retornoBaldeStatus: string | null | undefined): boolean {
  return retornoBaldeStatus == null || retornoBaldeStatus === 'APROVADO_ENVASE';
}

export function mensagemBloqueioEnvase(retornoBaldeStatus: string | null | undefined): string | null {
  if (retornoBaldeStatus === 'AGUARDANDO_TRIAGEM') {
    return 'Este balde ainda aguarda triagem na indústria. Abra «Triagem — baldes das lojas» antes do envase.';
  }
  return null;
}
