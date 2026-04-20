import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Divergencia } from '@/types/database';
import { registrarAuditoria } from './auditoria';
import { recalcularEstoqueProduto } from './estoque-sync';

const SELECT_DIV_ADMIN = `
  id, transferencia_id, item_id, tipo, resolvido, created_at, resolvido_por,
  transferencia:transferencias(
    id, tipo, status, viagem_id, created_at,
    origem:locais!origem_id(id, nome, tipo),
    destino:locais!destino_id(id, nome, tipo)
  ),
  item:itens(id, token_qr, token_short, produto:produtos(nome)),
  resolvedor:usuarios!resolvido_por(nome)
`;

function chunkIds<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export type LocalNomeTipo = { id: string; nome: string; tipo: string };

export interface DivergenciaAdminRow {
  id: string;
  transferencia_id: string;
  item_id: string;
  tipo: 'FALTANTE' | 'EXCEDENTE';
  resolvido: boolean;
  resolvido_por: string | null;
  created_at: string;
  transferencia?: {
    id: string;
    tipo: string;
    status: string;
    viagem_id: string | null;
    created_at: string;
    origem: LocalNomeTipo | null;
    destino: LocalNomeTipo | null;
  } | null;
  item?: {
    id: string;
    token_qr: string;
    token_short?: string | null;
    produto?: { nome: string } | null;
  } | null;
  resolvedor?: { nome: string } | null;
}

export interface ListarDivergenciasAdminOpts {
  situacao: 'abertas' | 'resolvidas' | 'todas';
  /** Loja de destino da remessa (recebimento). */
  destinoId?: string | null;
  tipo?: 'FALTANTE' | 'EXCEDENTE' | null;
  /** UUID completo da transferência. */
  transferenciaIdExato?: string | null;
  buscaTrim?: string;
  /** Máximo de linhas após filtros de servidor (padrão 700). */
  limite?: number;
}

/**
 * Lista divergências para a tela administrativa, com filtros no servidor quando possível.
 * `destinoId` resolve remessas da loja e busca divergências só dessas transferências (em fatias `.in`, evita URL longa).
 */
export async function listarDivergenciasAdmin(
  opts: ListarDivergenciasAdminOpts
): Promise<DivergenciaAdminRow[]> {
  const limite = Math.min(Math.max(opts.limite ?? 700, 1), 1500);
  const busca = (opts.buscaTrim || '').trim().toLowerCase();

  /* eslint-disable @typescript-eslint/no-explicit-any -- builder PostgREST após .select(). */
  const aplicarSituacaoETipo = (q: any) => {
    let x = q;
    if (opts.situacao === 'abertas') x = x.eq('resolvido', false);
    else if (opts.situacao === 'resolvidas') x = x.eq('resolvido', true);
    if (opts.tipo) x = x.eq('tipo', opts.tipo);
    if (opts.transferenciaIdExato?.trim()) {
      x = x.eq('transferencia_id', opts.transferenciaIdExato.trim());
    }
    return x;
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */

  let rows: Record<string, unknown>[] = [];

  if (opts.destinoId?.trim()) {
    const { data: trs, error: e1 } = await supabase
      .from('transferencias')
      .select('id')
      .eq('destino_id', opts.destinoId.trim());
    if (e1) throw e1;
    const tids = (trs || []).map((t) => t.id as string);
    if (tids.length === 0) return [];

    const parts = chunkIds(tids, 50);
    const perChunk = Math.min(400, Math.max(Math.ceil(limite / Math.max(parts.length, 1)) + 25, 80));
    const pages = await Promise.all(
      parts.map(async (ids) => {
        const { data, error } = await aplicarSituacaoETipo(
          supabase.from('divergencias').select(SELECT_DIV_ADMIN)
        )
          .in('transferencia_id', ids)
          .order('created_at', { ascending: false })
          .limit(perChunk);
        if (error) throw error;
        return (data || []) as Record<string, unknown>[];
      })
    );
    rows = pages.flat();
    const seen = new Set<string>();
    rows = rows.filter((r) => {
      const id = String(r.id);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    rows.sort(
      (a, b) =>
        new Date(String(b.created_at)).getTime() - new Date(String(a.created_at)).getTime()
    );
    rows = rows.slice(0, limite);
  } else {
    const { data, error } = await aplicarSituacaoETipo(
      supabase.from('divergencias').select(SELECT_DIV_ADMIN)
    )
      .order('created_at', { ascending: false })
      .limit(limite);
    if (error) throw error;
    rows = (data || []) as Record<string, unknown>[];
  }

  if (busca) {
    rows = rows.filter((r) => {
      const item = r.item as DivergenciaAdminRow['item'];
      const nome = String(item?.produto?.nome || '').toLowerCase();
      const token = String(item?.token_qr || '').toLowerCase();
      const ts = String(item?.token_short || '').toLowerCase();
      const tid = String(r.transferencia_id || '').toLowerCase();
      const vid = String(
        (r.transferencia as DivergenciaAdminRow['transferencia'])?.viagem_id || ''
      ).toLowerCase();
      return (
        nome.includes(busca) ||
        token.includes(busca) ||
        ts.includes(busca) ||
        tid.includes(busca) ||
        vid.includes(busca)
      );
    });
  }

  return rows as unknown as DivergenciaAdminRow[];
}

function embedNome(v: unknown): string {
  if (v == null) return '?';
  if (Array.isArray(v)) return (v[0] as { nome?: string })?.nome?.trim() || '?';
  return (v as { nome?: string }).nome?.trim() || '?';
}

export type RemessaDivergenciaOption = {
  id: string;
  created_at: string;
  status: string;
  origem_nome: string;
  destino_nome: string;
  viagem_resumo: string | null;
};

/**
 * Remessas que já geraram ao menos uma linha em `divergencias` (mais recentes primeiro).
 * Útil para `<select>` sem colar UUID. Opcionalmente restrito ao `destino_id` da loja.
 */
export async function listarRemessasParaFiltroDivergencias(opts: {
  destinoId?: string | null;
  limite?: number;
}): Promise<RemessaDivergenciaOption[]> {
  const lim = Math.min(Math.max(opts.limite ?? 150, 1), 300);

  const { data: divRows, error: e1 } = await supabase
    .from('divergencias')
    .select('transferencia_id')
    .order('created_at', { ascending: false })
    .limit(2500);
  if (e1) throw e1;

  const orderedIds: string[] = [];
  const seen = new Set<string>();
  for (const r of divRows || []) {
    const id = String((r as { transferencia_id: string }).transferencia_id);
    if (!seen.has(id)) {
      seen.add(id);
      orderedIds.push(id);
      if (orderedIds.length >= lim + 80) break;
    }
  }
  if (orderedIds.length === 0) return [];

  const CHUNK = 55;
  const metaById = new Map<string, RemessaDivergenciaOption>();
  for (let i = 0; i < orderedIds.length; i += CHUNK) {
    const chunk = orderedIds.slice(i, i + CHUNK);
    /* eslint-disable @typescript-eslint/no-explicit-any */
    let q: any = supabase
      .from('transferencias')
      .select(
        'id, created_at, status, viagem_id, origem:locais!origem_id(nome), destino:locais!destino_id(nome)'
      )
      .in('id', chunk);
    if (opts.destinoId?.trim()) q = q.eq('destino_id', opts.destinoId.trim());
    const { data, error } = await q;
    /* eslint-enable @typescript-eslint/no-explicit-any */
    if (error) throw error;
    for (const t of data || []) {
      const row = t as {
        id: string;
        created_at: string;
        status: string;
        viagem_id: string | null;
        origem: unknown;
        destino: unknown;
      };
      const vid = row.viagem_id ? String(row.viagem_id).slice(0, 8).toUpperCase() : null;
      metaById.set(row.id, {
        id: row.id,
        created_at: row.created_at,
        status: row.status,
        origem_nome: embedNome(row.origem),
        destino_nome: embedNome(row.destino),
        viagem_resumo: vid,
      });
    }
  }

  const result: RemessaDivergenciaOption[] = [];
  for (const id of orderedIds) {
    const m = metaById.get(id);
    if (m) {
      result.push(m);
      if (result.length >= lim) break;
    }
  }
  return result;
}

export interface DivergenciaCompleta extends Divergencia {
  transferencia?: { id: string; origem?: { nome: string }; destino?: { nome: string } };
  item?: { id: string; token_qr: string; produto?: { nome: string } };
  resolvedor?: { id: string; nome: string } | null;
}

export async function getDivergencias(apenasAbertas = true): Promise<DivergenciaCompleta[]> {
  let query = supabase
    .from('divergencias')
    .select(`
      *,
      transferencia:transferencias(id, origem:locais!origem_id(nome), destino:locais!destino_id(nome)),
      item:itens(id, token_qr, produto:produtos(nome)),
      resolvedor:usuarios!resolvido_por(id, nome)
    `)
    .order('created_at', { ascending: false });

  if (apenasAbertas) query = query.eq('resolvido', false);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function resolverDivergencia(id: string, usuarioId: string): Promise<void> {
  await supabase
    .from('divergencias')
    .update({ resolvido: true, resolvido_por: usuarioId })
    .eq('id', id);

  await registrarAuditoria({
    usuario_id: usuarioId,
    acao: 'RESOLVER_DIVERGENCIA',
    detalhes: { divergencia_id: id },
  });
}

function unwrapEmbed<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

/**
 * Gestor confirma o faltante físico: marca `recebido` na remessa, move o item para o **local destino**
 * (`EM_ESTOQUE`), recalcula agregado e fecha a divergência. Usar com **service role** na API.
 */
export async function darEntradaFaltanteNaLojaDivergencia(
  divergenciaId: string,
  usuarioId: string,
  client: SupabaseClient
): Promise<void> {
  const { data: raw, error: eDiv } = await client
    .from('divergencias')
    .select(
      `id, transferencia_id, item_id, tipo, resolvido, transferencia:transferencias(id, destino_id, status)`
    )
    .eq('id', divergenciaId)
    .single();

  if (eDiv) throw new Error(eDiv.message);
  if (!raw) throw new Error('Divergência não encontrada');

  if (raw.resolvido) {
    throw new Error('Esta divergência já foi resolvida.');
  }
  if (raw.tipo !== 'FALTANTE') {
    throw new Error('Só é possível dar entrada automática para divergências do tipo faltante.');
  }

  const tr = unwrapEmbed(
    raw.transferencia as unknown as { id: string; destino_id: string; status: string } | null
  );
  if (!tr?.destino_id) {
    throw new Error('Remessa não encontrada.');
  }
  if (tr.status !== 'DIVERGENCE') {
    throw new Error(
      'A remessa não está em status «Divergência». Só é possível dar entrada após o recebimento com divergência.'
    );
  }

  const destinoId = tr.destino_id;
  const transId = raw.transferencia_id as string;
  const itemId = raw.item_id as string;

  const { data: ti, error: eTi } = await client
    .from('transferencia_itens')
    .select('recebido')
    .eq('transferencia_id', transId)
    .eq('item_id', itemId)
    .maybeSingle();
  if (eTi) throw new Error(eTi.message);
  if (!ti) {
    throw new Error('Item não pertence a esta remessa.');
  }

  const { data: item, error: eItem } = await client
    .from('itens')
    .select('id, produto_id, estado, local_atual_id')
    .eq('id', itemId)
    .single();
  if (eItem || !item) {
    throw new Error('Item não encontrado.');
  }

  const destinoOk = item.estado === 'EM_ESTOQUE' && item.local_atual_id === destinoId;

  if (!destinoOk) {
    if (item.estado === 'BAIXADO' || item.estado === 'DESCARTADO') {
      throw new Error('O item não pode entrar no estoque (estado inválido).');
    }
  }

  if (!ti.recebido) {
    const { error: eUpTi } = await client
      .from('transferencia_itens')
      .update({ recebido: true })
      .eq('transferencia_id', transId)
      .eq('item_id', itemId);
    if (eUpTi) throw new Error(eUpTi.message);
  }

  if (!destinoOk) {
    const { error: eUpIt } = await client
      .from('itens')
      .update({ local_atual_id: destinoId, estado: 'EM_ESTOQUE' })
      .eq('id', itemId);
    if (eUpIt) throw new Error(eUpIt.message);
    await recalcularEstoqueProduto(String(item.produto_id), client);
  }

  const { error: eRes } = await client
    .from('divergencias')
    .update({ resolvido: true, resolvido_por: usuarioId })
    .eq('id', divergenciaId);
  if (eRes) throw new Error(eRes.message);

  await registrarAuditoria(
    {
      usuario_id: usuarioId,
      local_id: destinoId,
      item_id: itemId,
      acao: 'ENTRADA_FALTANTE_DIVERGENCIA_LOJA',
      detalhes: {
        divergencia_id: divergenciaId,
        transferencia_id: transId,
        apenas_marcou_recebido: destinoOk,
      },
    },
    client
  );
}
