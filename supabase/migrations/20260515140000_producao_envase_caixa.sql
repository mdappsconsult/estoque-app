-- Produção envase: balde (acabado) → caixa (acabado), mesmo local (indústria). Metadados para relatório.

ALTER TABLE public.producoes
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'PADRAO';

ALTER TABLE public.producoes
  ADD COLUMN IF NOT EXISTS envase_produto_balde_id UUID REFERENCES public.produtos(id) ON DELETE SET NULL;

ALTER TABLE public.producoes
  ADD COLUMN IF NOT EXISTS envase_baldes_por_caixa INTEGER;

ALTER TABLE public.producoes
  DROP CONSTRAINT IF EXISTS producoes_tipo_chk;

ALTER TABLE public.producoes
  ADD CONSTRAINT producoes_tipo_chk CHECK (tipo IN ('PADRAO', 'ENVASE_CAIXA'));

ALTER TABLE public.producoes
  DROP CONSTRAINT IF EXISTS producoes_envase_baldes_por_caixa_chk;

ALTER TABLE public.producoes
  ADD CONSTRAINT producoes_envase_baldes_por_caixa_chk
  CHECK (envase_baldes_por_caixa IS NULL OR envase_baldes_por_caixa >= 1);

COMMENT ON COLUMN public.producoes.tipo IS 'PADRAO = produção de balde com insumos tradicionais; ENVASE_CAIXA = consumo explícito de baldes por QR → caixas com QR.';
COMMENT ON COLUMN public.producoes.envase_produto_balde_id IS 'Quando tipo=ENVASE_CAIXA: produto do balde consumido.';
COMMENT ON COLUMN public.producoes.envase_baldes_por_caixa IS 'Quando tipo=ENVASE_CAIXA: quantos baldes inteiros por uma caixa (ex.: 2).';
