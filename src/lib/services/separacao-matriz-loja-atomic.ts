import type { SupabaseClient } from '@supabase/supabase-js';
import { registrarAuditoria } from '@/lib/services/auditoria';
import { adicionarItensTransferenciaMatrizLoja, criarTransferencia } from '@/lib/services/transferencias';
import { upsertEtiquetasSeparacaoLoja, type UpsertEtiquetaSeparacaoItem } from '@/lib/services/etiquetas';

export const MAX_ITENS_SEPARACAO = 600;

/** Tamanho de cada POST ao gravar separação grande (continuação na mesma remessa via API dedicada). */
export const CHUNK_ITENS_SEPARACAO_HTTP = 200;

export type CriarSeparacaoMatrizLojaParams = {
  origem_id: string;
  destino_id: string;
  criado_por: string;
  itens: UpsertEtiquetaSeparacaoItem[];
};

export type CriarSeparacaoMatrizLojaResultado = {
  viagem_id: string;
  lote: string;
  transferencia_id: string;
  /** Números de balde por item (impressão 60×30), quando aplicável. */
  numeros_por_item_id: Record<string, number | null>;
};

/**
 * Remove vestígios de uma separação que falhou após criar `viagens` (e possivelmente `etiquetas` / `transferencias`).
 * Ordem: transferências da viagem → marcar etiquetas do lote como excluídas → apagar viagem.
 */
export async function compensarSeparacaoMatrizLojaIncompleta(
  admin: SupabaseClient,
  viagemId: string,
  loteSep: string,
  opts?: { usuario_id?: string | null; origem_id?: string | null }
): Promise<void> {
  const lote = loteSep.trim();
  await admin.from('transferencias').delete().eq('viagem_id', viagemId);
  if (lote) {
    await admin.from('etiquetas').update({ excluida: true }).eq('lote', lote);
  }
  await admin.from('viagens').delete().eq('id', viagemId);

  await registrarAuditoria(
    {
      usuario_id: opts?.usuario_id ?? null,
      local_id: opts?.origem_id ?? null,
      acao: 'ROLLBACK_SEPARACAO_MATRIZ_LOJA_INCOMPLETA',
      detalhes: { viagem_id: viagemId, lote_sep: lote || null },
    },
    admin
  );
}

/**
 * Uma única sequência servidor-side: viagem → etiquetas `SEP-…` → transferência + itens.
 * Em qualquer falha após criar a viagem, executa compensação para não deixar lote órfão sem `transferencias`.
 */
export async function criarSeparacaoMatrizLojaAtomica(
  admin: SupabaseClient,
  params: CriarSeparacaoMatrizLojaParams
): Promise<CriarSeparacaoMatrizLojaResultado> {
  const origem = params.origem_id.trim();
  const destino = params.destino_id.trim();
  const criadoPor = params.criado_por.trim();
  const itens = params.itens;

  if (!origem || !destino || !criadoPor) {
    throw new Error('Origem, destino e usuário são obrigatórios');
  }
  if (itens.length === 0) {
    throw new Error('Inclua pelo menos um item na separação');
  }
  if (itens.length > MAX_ITENS_SEPARACAO) {
    throw new Error(
      `Limite de ${MAX_ITENS_SEPARACAO} unidades por requisição. Divida em duas separações ou contate o suporte.`
    );
  }

  const { data: viagem, error: ev } = await admin
    .from('viagens')
    .insert({ status: 'PENDING' })
    .select()
    .single();
  if (ev) throw ev;
  if (!viagem?.id) throw new Error('Falha ao criar viagem');

  const viagemId = viagem.id as string;
  const lote = `SEP-${viagemId}`;

  try {
    const numerosPorItemId = await upsertEtiquetasSeparacaoLoja(
      itens,
      {
        lote,
        mode: 'manter_impressa_se_existir',
        local_destino_id: destino,
      },
      admin
    );

    const tr = await criarTransferencia(
      {
        tipo: 'WAREHOUSE_STORE',
        origem_id: origem,
        destino_id: destino,
        viagem_id: viagemId,
        criado_por: criadoPor,
        status: 'AWAITING_ACCEPT',
      },
      itens.map((i) => i.id),
      admin
    );

    const numeros_por_item_id: Record<string, number | null> = {};
    for (const [k, v] of numerosPorItemId.entries()) {
      numeros_por_item_id[k] = v;
    }

    return {
      viagem_id: viagemId,
      lote,
      transferencia_id: tr.id as string,
      numeros_por_item_id,
    };
  } catch (e) {
    try {
      await compensarSeparacaoMatrizLojaIncompleta(admin, viagemId, lote, {
        usuario_id: criadoPor,
        origem_id: origem,
      });
    } catch (compErr) {
      console.error('Falha ao compensar separação incompleta:', compErr);
    }
    throw e;
  }
}

export type AdicionarItensSeparacaoMatrizLojaResultado = {
  transferencia_id: string;
  lote: string;
  viagem_id: string;
  numeros_por_item_id: Record<string, number | null>;
};

/**
 * Grava mais unidades na **mesma** remessa (`transferencias`) e no mesmo lote `SEP-{viagem}`.
 * Só antes do despacho (status aguardando aceite ou aceita).
 */
export async function adicionarItensSeparacaoMatrizLojaNaTransferencia(
  admin: SupabaseClient,
  params: {
    transferencia_id: string;
    criado_por: string;
    itens: UpsertEtiquetaSeparacaoItem[];
  }
): Promise<AdicionarItensSeparacaoMatrizLojaResultado> {
  const tid = params.transferencia_id.trim();
  const criadoPor = params.criado_por.trim();
  const itens = params.itens;
  if (!tid || !criadoPor) {
    throw new Error('Transferência e usuário são obrigatórios');
  }
  if (itens.length === 0) {
    throw new Error('Inclua pelo menos um item');
  }
  if (itens.length > CHUNK_ITENS_SEPARACAO_HTTP) {
    throw new Error(
      `No máximo ${CHUNK_ITENS_SEPARACAO_HTTP} unidades por requisição de continuação.`
    );
  }

  const { data: tr, error } = await admin
    .from('transferencias')
    .select('id, tipo, status, origem_id, destino_id, viagem_id')
    .eq('id', tid)
    .single();
  if (error) throw error;
  if (!tr?.viagem_id) {
    throw new Error('Remessa sem viagem vinculada');
  }
  if (tr.tipo !== 'WAREHOUSE_STORE') {
    throw new Error('Só é possível acrescentar itens em remessas indústria → loja');
  }

  const viagemId = String(tr.viagem_id);
  const lote = `SEP-${viagemId}`;
  const destinoId = String(tr.destino_id || '').trim();
  if (!destinoId) {
    throw new Error('Remessa sem destino');
  }

  const numerosPorItemId = await upsertEtiquetasSeparacaoLoja(
    itens,
    {
      lote,
      mode: 'manter_impressa_se_existir',
      local_destino_id: destinoId,
    },
    admin
  );

  await adicionarItensTransferenciaMatrizLoja(
    tid,
    itens.map((i) => i.id),
    criadoPor,
    admin
  );

  const numeros_por_item_id: Record<string, number | null> = {};
  for (const [k, v] of numerosPorItemId.entries()) {
    numeros_por_item_id[k] = v;
  }

  return {
    transferencia_id: tid,
    lote,
    viagem_id: viagemId,
    numeros_por_item_id,
  };
}
