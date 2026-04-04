-- URL pública do bridge WebSocket no Raspberry (ex.: Cloudflare Tunnel wss://...).
-- O app lê esta tabela quando NEXT_PUBLIC_PI_PRINT_WS_URL não está definida.

CREATE TABLE IF NOT EXISTS public.config_impressao_pi (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  ws_public_url TEXT NOT NULL DEFAULT '',
  ws_token TEXT NOT NULL DEFAULT '',
  cups_queue TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.config_impressao_pi (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.config_impressao_pi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_config_impressao_pi" ON public.config_impressao_pi;
CREATE POLICY "allow_all_config_impressao_pi" ON public.config_impressao_pi
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.config_impressao_pi IS
  'Ponte de impressão Pi: ws_public_url (wss:// via túnel), token opcional, fila CUPS opcional.';
