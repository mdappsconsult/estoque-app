import { supabase } from '@/lib/supabase';

/** Exclui datas sentinela de «sem validade» (ex.: 2999) da lista operacional. */
export const DATA_VALIDADE_LIMITE_SENTINELA = '2100-01-01T00:00:00.000Z';

export type ItemValidadeRow = {
  id: string;
  token_qr: string;
  estado: string;
  local_atual_id: string | null;
  data_validade: string;
  produto: { nome: string } | null;
  local_atual: { nome: string } | null;
};

const SELECT_VALIDADES =
  'id, token_qr, estado, local_atual_id, data_validade, produto:produtos(nome), local_atual:locais!local_atual_id(nome)';

/**
 * Itens em estoque com validade «real» vencida ou nos próximos N dias.
 * `localAtualId` omitido = todas as unidades (gerência).
 */
export async function listarItensAlertaValidade(input: {
  localAtualId?: string | null;
  diasProximos: number;
  limiteVencidos?: number;
  limiteProximos?: number;
}): Promise<{ proximos: ItemValidadeRow[]; vencidos: ItemValidadeRow[]; error: string | null }> {
  const agoraIso = new Date().toISOString();
  const limite = new Date();
  limite.setDate(limite.getDate() + input.diasProximos);
  const limiteIso = limite.toISOString();

  const base = () => {
    let q = supabase
      .from('itens')
      .select(SELECT_VALIDADES)
      .eq('estado', 'EM_ESTOQUE')
      .not('data_validade', 'is', null)
      .lt('data_validade', DATA_VALIDADE_LIMITE_SENTINELA);
    if (input.localAtualId) {
      q = q.eq('local_atual_id', input.localAtualId);
    }
    return q;
  };

  const limiteV = input.limiteVencidos ?? 500;
  const limiteP = input.limiteProximos ?? 2000;

  const [resVenc, resProx] = await Promise.all([
    base().lt('data_validade', agoraIso).order('data_validade', { ascending: true }).limit(limiteV),
    base()
      .gte('data_validade', agoraIso)
      .lte('data_validade', limiteIso)
      .order('data_validade', { ascending: true })
      .limit(limiteP),
  ]);

  if (resVenc.error) {
    return { proximos: [], vencidos: [], error: resVenc.error.message };
  }
  if (resProx.error) {
    return { proximos: [], vencidos: [], error: resProx.error.message };
  }

  return {
    vencidos: (resVenc.data || []) as unknown as ItemValidadeRow[],
    proximos: (resProx.data || []) as unknown as ItemValidadeRow[],
    error: null,
  };
}
