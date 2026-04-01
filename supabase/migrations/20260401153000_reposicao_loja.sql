-- Reposição por loja: catálogo de produtos por loja + última contagem enviada
CREATE TABLE IF NOT EXISTS public.loja_produtos_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  loja_id UUID NOT NULL REFERENCES public.locais(id) ON DELETE CASCADE,
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  ativo_na_loja BOOLEAN NOT NULL DEFAULT true,
  estoque_minimo_loja INTEGER NOT NULL DEFAULT 0 CHECK (estoque_minimo_loja >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (loja_id, produto_id)
);

CREATE TABLE IF NOT EXISTS public.loja_contagens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  loja_id UUID NOT NULL REFERENCES public.locais(id) ON DELETE CASCADE,
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  quantidade_contada INTEGER NOT NULL DEFAULT 0 CHECK (quantidade_contada >= 0),
  contado_por UUID REFERENCES public.usuarios(id),
  contado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (loja_id, produto_id)
);

CREATE INDEX IF NOT EXISTS idx_loja_produtos_config_loja_ativo
  ON public.loja_produtos_config(loja_id, ativo_na_loja);

CREATE INDEX IF NOT EXISTS idx_loja_contagens_loja_produto
  ON public.loja_contagens(loja_id, produto_id);

ALTER TABLE public.loja_produtos_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loja_contagens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_loja_produtos_config" ON public.loja_produtos_config;
CREATE POLICY "allow_all_loja_produtos_config" ON public.loja_produtos_config
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_loja_contagens" ON public.loja_contagens;
CREATE POLICY "allow_all_loja_contagens" ON public.loja_contagens
  FOR ALL USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.loja_produtos_config;
ALTER PUBLICATION supabase_realtime ADD TABLE public.loja_contagens;
