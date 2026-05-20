-- Envio direto da produção: remessa indústria → loja em que a loja bipa os QRs e o sistema
-- baixa indústria / soma loja na hora. Indústria só escolhe loja + produto (balde de produção) + qty;
-- não cria `transferencia_itens` antecipadamente.

ALTER TABLE public.transferencias
  ADD COLUMN IF NOT EXISTS modo_bip_loja BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.transferencias
  ADD COLUMN IF NOT EXISTS produto_demandado_id UUID REFERENCES public.produtos(id) ON DELETE SET NULL;

ALTER TABLE public.transferencias
  ADD COLUMN IF NOT EXISTS quantidade_demandada INTEGER;

-- Quando modo_bip_loja = TRUE, exige produto + qty >= 1 e tipo WAREHOUSE_STORE.
ALTER TABLE public.transferencias
  DROP CONSTRAINT IF EXISTS transferencias_modo_bip_loja_chk;

ALTER TABLE public.transferencias
  ADD CONSTRAINT transferencias_modo_bip_loja_chk CHECK (
    modo_bip_loja = FALSE
    OR (
      tipo = 'WAREHOUSE_STORE'
      AND produto_demandado_id IS NOT NULL
      AND quantidade_demandada IS NOT NULL
      AND quantidade_demandada >= 1
    )
  );

CREATE INDEX IF NOT EXISTS idx_transferencias_modo_bip_loja
  ON public.transferencias (modo_bip_loja)
  WHERE modo_bip_loja = TRUE;

COMMENT ON COLUMN public.transferencias.modo_bip_loja IS
  'TRUE = remessa criada pela indústria SEM lista de QRs; a loja escaneia cada balde para baixar/somar estoque (envio direto da produção).';
COMMENT ON COLUMN public.transferencias.produto_demandado_id IS
  'Quando modo_bip_loja = TRUE: produto que a indústria está mandando (deve ser balde de produção).';
COMMENT ON COLUMN public.transferencias.quantidade_demandada IS
  'Quando modo_bip_loja = TRUE: quantos baldes a indústria está enviando (limite máximo de bips antes de fechar).';
