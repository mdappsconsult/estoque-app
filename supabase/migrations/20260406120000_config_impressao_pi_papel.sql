-- Duas pontes Pi: estoque (Separar por Loja) e indústria (futuro / segundo Raspberry).
-- Migra linha id=1 existente para papel = estoque; cria linha industria com segredo próprio.

ALTER TABLE public.config_impressao_pi
  DROP CONSTRAINT IF EXISTS config_impressao_pi_id_check;

ALTER TABLE public.config_impressao_pi
  ADD COLUMN IF NOT EXISTS papel text;

UPDATE public.config_impressao_pi
SET papel = 'estoque'
WHERE id = 1 AND (papel IS NULL OR btrim(papel) = '');

INSERT INTO public.config_impressao_pi (id, papel, ws_public_url, ws_token, cups_queue, tunnel_sync_secret)
SELECT
  2,
  'industria',
  '',
  '',
  '',
  encode(gen_random_bytes(32), 'hex')
WHERE NOT EXISTS (SELECT 1 FROM public.config_impressao_pi WHERE papel = 'industria');

ALTER TABLE public.config_impressao_pi
  ALTER COLUMN papel SET NOT NULL;

ALTER TABLE public.config_impressao_pi
  DROP CONSTRAINT IF EXISTS config_impressao_pi_papel_check;

ALTER TABLE public.config_impressao_pi
  ADD CONSTRAINT config_impressao_pi_papel_check
  CHECK (papel IN ('estoque', 'industria'));

CREATE UNIQUE INDEX IF NOT EXISTS config_impressao_pi_papel_uidx
  ON public.config_impressao_pi (papel);

COMMENT ON COLUMN public.config_impressao_pi.papel IS
  'estoque = ponte da loja/separação; industria = segunda ponte (ex.: produção).';

-- RPC: terceiro parâmetro opcional (default estoque) — Pi antigo continua a funcionar.
DROP FUNCTION IF EXISTS public.sync_pi_tunnel_ws_url(text, text);

CREATE OR REPLACE FUNCTION public.sync_pi_tunnel_ws_url(
  p_sync_secret text,
  p_https_url text,
  p_papel text DEFAULT 'estoque'
)
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
  papel_norm text;
BEGIN
  IF p_sync_secret IS NULL OR btrim(p_sync_secret) = '' THEN
    RAISE EXCEPTION 'sync_secret required' USING ERRCODE = '28000';
  END IF;

  papel_norm := lower(btrim(p_papel));
  IF papel_norm NOT IN ('estoque', 'industria') THEN
    RAISE EXCEPTION 'invalid papel' USING ERRCODE = '22023';
  END IF;

  SELECT tunnel_sync_secret INTO expected
  FROM public.config_impressao_pi
  WHERE papel = papel_norm;

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
  WHERE papel = papel_norm;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_pi_tunnel_ws_url(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_pi_tunnel_ws_url(text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.sync_pi_tunnel_ws_url(text, text, text) TO authenticated;

COMMENT ON FUNCTION public.sync_pi_tunnel_ws_url(text, text, text) IS
  'Atualiza ws_public_url (https→wss) quando p_sync_secret confere à linha do papel. Pi: enviar p_papel estoque ou industria.';

-- Leitura + edição de URL/token/fila pelo app (segredo do túnel continua só no SQL / service_role).
REVOKE ALL ON public.config_impressao_pi FROM anon, authenticated;
GRANT SELECT (id, papel, ws_public_url, ws_token, cups_queue, updated_at) ON public.config_impressao_pi TO anon, authenticated;
GRANT UPDATE (ws_public_url, ws_token, cups_queue, updated_at) ON public.config_impressao_pi TO anon, authenticated;

GRANT ALL ON public.config_impressao_pi TO service_role;
