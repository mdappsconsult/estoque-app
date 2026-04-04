-- Sincronização automática da URL do túnel (quick Cloudflare ou outro HTTPS público)
-- a partir do Raspberry, sem service role no Pi: RPC validada por tunnel_sync_secret.

ALTER TABLE public.config_impressao_pi
  ADD COLUMN IF NOT EXISTS tunnel_sync_secret TEXT;

UPDATE public.config_impressao_pi
SET tunnel_sync_secret = encode(gen_random_bytes(32), 'hex')
WHERE id = 1 AND (tunnel_sync_secret IS NULL OR btrim(tunnel_sync_secret) = '');

COMMENT ON COLUMN public.config_impressao_pi.tunnel_sync_secret IS
  'Segredo para o Pi chamar sync_pi_tunnel_ws_url (anon + este segredo). Não expor no front.';

CREATE OR REPLACE FUNCTION public.sync_pi_tunnel_ws_url(p_sync_secret text, p_https_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expected text;
  host_part text;
  wss_url text;
  u text;
BEGIN
  IF p_sync_secret IS NULL OR btrim(p_sync_secret) = '' THEN
    RAISE EXCEPTION 'sync_secret required' USING ERRCODE = '28000';
  END IF;

  SELECT tunnel_sync_secret INTO expected FROM public.config_impressao_pi WHERE id = 1;
  IF expected IS NULL OR btrim(expected) = '' OR p_sync_secret <> expected THEN
    RAISE EXCEPTION 'invalid sync secret' USING ERRCODE = '28000';
  END IF;

  u := btrim(p_https_url);
  IF u IS NULL OR length(u) > 512 OR u !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*[A-Za-z0-9](:[0-9]{1,5})?(/.*)?$' THEN
    RAISE EXCEPTION 'invalid https url' USING ERRCODE = '22023';
  END IF;

  host_part := lower((regexp_match(u, '^https://([^/:?#]+)'))[1]);
  IF host_part IS NULL OR host_part IN ('localhost', '127.0.0.1', '0.0.0.0', '::1') THEN
    RAISE EXCEPTION 'host not allowed' USING ERRCODE = '22023';
  END IF;
  IF host_part ~ '^127\.' OR host_part ~ '^10\.' OR host_part ~ '^192\.168\.' OR host_part ~ '^172\.(1[6-9]|2[0-9]|3[0-1])\.' THEN
    RAISE EXCEPTION 'private host not allowed' USING ERRCODE = '22023';
  END IF;

  wss_url := regexp_replace(u, '^https://', 'wss://');
  wss_url := regexp_replace(wss_url, '/+$', '');

  UPDATE public.config_impressao_pi
  SET ws_public_url = wss_url, updated_at = now()
  WHERE id = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_pi_tunnel_ws_url(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_pi_tunnel_ws_url(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.sync_pi_tunnel_ws_url(text, text) TO authenticated;

COMMENT ON FUNCTION public.sync_pi_tunnel_ws_url(text, text) IS
  'Atualiza ws_public_url (https→wss) quando p_sync_secret confere. Uso: Pi após quick tunnel.';
