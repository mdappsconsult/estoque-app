-- Login operacional (texto) em usuarios; hash só em tabela dedicada (sem SELECT via anon nas policies padrão).
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS login_operacional TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS usuarios_login_operacional_unique
  ON public.usuarios (login_operacional)
  WHERE login_operacional IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.credenciais_login_operacional (
  usuario_id UUID PRIMARY KEY REFERENCES public.usuarios(id) ON DELETE CASCADE,
  senha_hash TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.credenciais_login_operacional ENABLE ROW LEVEL SECURITY;
