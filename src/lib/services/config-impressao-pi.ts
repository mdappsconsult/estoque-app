import { supabase } from '@/lib/supabase';

export type ImpressaoPiPapel = 'estoque' | 'industria';

export interface ConfigImpressaoPiRow {
  id: number;
  papel: ImpressaoPiPapel;
  ws_public_url: string;
  ws_token: string;
  cups_queue: string;
  updated_at: string;
}

const SELECT_PUBLIC =
  'id, papel, ws_public_url, ws_token, cups_queue, updated_at';

/**
 * Lê uma linha por papel. Retorna null se não existir ou erro.
 */
export async function getConfigImpressaoPiByPapel(
  papel: ImpressaoPiPapel
): Promise<ConfigImpressaoPiRow | null> {
  const { data, error } = await supabase
    .from('config_impressao_pi')
    .select(SELECT_PUBLIC)
    .eq('papel', papel)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return data as ConfigImpressaoPiRow;
}

/** Compat: primeira ponte (estoque). */
export async function getConfigImpressaoPi(): Promise<ConfigImpressaoPiRow | null> {
  return getConfigImpressaoPiByPapel('estoque');
}

export async function listConfigsImpressaoPi(): Promise<ConfigImpressaoPiRow[]> {
  const { data, error } = await supabase
    .from('config_impressao_pi')
    .select(SELECT_PUBLIC)
    .order('papel', { ascending: true });

  if (error) throw error;
  return (data ?? []) as ConfigImpressaoPiRow[];
}

export type ConfigImpressaoPiEditable = Pick<
  ConfigImpressaoPiRow,
  'ws_public_url' | 'ws_token' | 'cups_queue'
>;

export async function updateConfigImpressaoPi(
  papel: ImpressaoPiPapel,
  patch: Partial<ConfigImpressaoPiEditable>
): Promise<void> {
  const { error } = await supabase
    .from('config_impressao_pi')
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq('papel', papel);

  if (error) throw error;
}
