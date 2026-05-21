-- Status do fluxo retorno de baldes vencidos (loja → indústria → triagem → envase/descarte)

ALTER TABLE public.itens
  ADD COLUMN IF NOT EXISTS retorno_balde_status text NULL;

ALTER TABLE public.itens
  DROP CONSTRAINT IF EXISTS itens_retorno_balde_status_check;

ALTER TABLE public.itens
  ADD CONSTRAINT itens_retorno_balde_status_check
  CHECK (
    retorno_balde_status IS NULL
    OR retorno_balde_status IN ('AGUARDANDO_TRIAGEM', 'APROVADO_ENVASE')
  );

CREATE INDEX IF NOT EXISTS itens_retorno_balde_aguardando_triagem_idx
  ON public.itens (local_atual_id)
  WHERE retorno_balde_status = 'AGUARDANDO_TRIAGEM' AND estado = 'EM_ESTOQUE';

COMMENT ON COLUMN public.itens.retorno_balde_status IS
  'Fluxo retorno loja: AGUARDANDO_TRIAGEM após coleta; APROVADO_ENVASE após triagem para caixa; NULL = balde normal ou já consumido.';
