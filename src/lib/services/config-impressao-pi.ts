import { supabase } from '@/lib/supabase';

export interface ConfigImpressaoPiRow {
  id: number;
  ws_public_url: string;
  ws_token: string;
  cups_queue: string;
  updated_at: string;
}

/**
 * Lê a linha singleton (id=1). Retorna null se vazia ou erro.
 */
export async function getConfigImpressaoPi(): Promise<ConfigImpressaoPiRow | null> {
  const { data, error } = await supabase
    .from('config_impressao_pi')
    .select('id, ws_public_url, ws_token, cups_queue, updated_at')
    .eq('id', 1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return data as ConfigImpressaoPiRow;
}
