-- Inscrições Web Push (1 por dispositivo/endpoint). Usado pelo backend
-- (`web-push`) para entregar avisos de protocolos via Apple/Google/FCM.
-- Acesso só via Service Role (rotas /api/push/*); RLS desnecessária no MVP.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS push_subscriptions_usuario_id_idx
  ON public.push_subscriptions(usuario_id);
