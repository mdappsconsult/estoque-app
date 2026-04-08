-- Produção: metadados (local, baldes), baixa de insumos vinculada e rastreio por item

ALTER TABLE public.producoes
  ADD COLUMN IF NOT EXISTS local_id UUID REFERENCES public.locais(id),
  ADD COLUMN IF NOT EXISTS num_baldes INTEGER;

UPDATE public.producoes SET num_baldes = quantidade WHERE num_baldes IS NULL;

ALTER TABLE public.producoes
  ALTER COLUMN num_baldes SET NOT NULL,
  ALTER COLUMN num_baldes SET DEFAULT 1;

ALTER TABLE public.baixas
  ADD COLUMN IF NOT EXISTS producao_id UUID REFERENCES public.producoes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_baixas_producao_id ON public.baixas(producao_id);

CREATE TABLE IF NOT EXISTS public.producao_consumo_itens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  producao_id UUID NOT NULL REFERENCES public.producoes(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.itens(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (producao_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_producao_consumo_itens_producao
  ON public.producao_consumo_itens(producao_id);
CREATE INDEX IF NOT EXISTS idx_producao_consumo_itens_item
  ON public.producao_consumo_itens(item_id);

ALTER TABLE public.producao_consumo_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_producao_consumo_itens" ON public.producao_consumo_itens;
CREATE POLICY "allow_all_producao_consumo_itens" ON public.producao_consumo_itens
  FOR ALL USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.producao_consumo_itens;
