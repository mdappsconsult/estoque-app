import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Cliente com service role — só em Route Handlers / Server Actions (nunca no bundle do cliente). */
export function createSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL ausente');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY ausente (necessária para login e senhas no banco)');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
