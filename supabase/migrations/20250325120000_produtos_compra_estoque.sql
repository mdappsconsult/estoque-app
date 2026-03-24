-- Campos de cadastro para produtos de compra / gestão de estoque
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'AMBOS';
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS estoque_minimo INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS custo_referencia NUMERIC(10,2);

ALTER TABLE public.produtos DROP CONSTRAINT IF EXISTS produtos_origem_check;
ALTER TABLE public.produtos ADD CONSTRAINT produtos_origem_check CHECK (origem IN ('COMPRA', 'PRODUCAO', 'AMBOS'));

COMMENT ON COLUMN public.produtos.origem IS 'COMPRA: só entrada por compra; PRODUCAO: só produção interna; AMBOS';
COMMENT ON COLUMN public.produtos.estoque_minimo IS 'Ponto de pedido em unidades físicas (QRs em estoque)';
COMMENT ON COLUMN public.produtos.custo_referencia IS 'Último ou custo de referência para compra (R$ unitário)';
