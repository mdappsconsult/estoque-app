-- Impede anon/authenticated de ler tunnel_sync_secret via PostgREST
-- (a RPC sync_pi_tunnel_ws_url é SECURITY DEFINER e continua válida).

REVOKE ALL ON public.config_impressao_pi FROM anon, authenticated;
GRANT SELECT (id, ws_public_url, ws_token, cups_queue, updated_at) ON public.config_impressao_pi TO anon, authenticated;

GRANT ALL ON public.config_impressao_pi TO service_role;
