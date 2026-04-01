-- Separar classificação de categoria (família) e tipo de embalagem
CREATE TABLE IF NOT EXISTS public.tipos_embalagem (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS embalagem_tipo_id UUID REFERENCES public.tipos_embalagem(id);

CREATE INDEX IF NOT EXISTS idx_produtos_embalagem_tipo_id
  ON public.produtos(embalagem_tipo_id);

ALTER TABLE public.tipos_embalagem ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_tipos_embalagem" ON public.tipos_embalagem;
CREATE POLICY "allow_all_tipos_embalagem" ON public.tipos_embalagem
  FOR ALL USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.tipos_embalagem;
