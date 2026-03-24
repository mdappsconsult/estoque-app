-- Torna rastreabilidade de compra obrigatória para reduzir erro operacional.
ALTER TABLE public.lotes_compra
  ALTER COLUMN fornecedor SET NOT NULL;

ALTER TABLE public.lotes_compra
  ALTER COLUMN lote_fornecedor SET NOT NULL;

ALTER TABLE public.lotes_compra
  ADD COLUMN IF NOT EXISTS nota_fiscal TEXT,
  ADD COLUMN IF NOT EXISTS sem_nota_fiscal BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_sem_nota TEXT;

ALTER TABLE public.lotes_compra
  DROP CONSTRAINT IF EXISTS lotes_compra_nota_fiscal_check;

ALTER TABLE public.lotes_compra
  ADD CONSTRAINT lotes_compra_nota_fiscal_check CHECK (
    (sem_nota_fiscal = false AND nota_fiscal IS NOT NULL AND btrim(nota_fiscal) <> '')
    OR
    (sem_nota_fiscal = true AND motivo_sem_nota IS NOT NULL AND btrim(motivo_sem_nota) <> '')
  );
