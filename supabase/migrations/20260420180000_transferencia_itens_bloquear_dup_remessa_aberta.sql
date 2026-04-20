-- Impede o mesmo item (QR) em duas remessas abertas ao mesmo tempo (corrida entre duas requisições).
-- Complementa a checagem em `criarTransferencia` (app): aqui a garantia é no Postgres.
-- Status "abertos": AWAITING_ACCEPT, ACCEPTED, IN_TRANSIT.

CREATE OR REPLACE FUNCTION public.transferencia_itens_bloquear_dup_remessa_aberta()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF NEW.item_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Serializa concorrência por unidade (evita duas transações inserirem o mesmo item em remessas distintas).
  PERFORM 1 FROM public.itens WHERE id = NEW.item_id FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.transferencia_itens ti
    JOIN public.transferencias tr ON tr.id = ti.transferencia_id
    WHERE ti.item_id = NEW.item_id
      AND ti.transferencia_id IS DISTINCT FROM NEW.transferencia_id
      AND tr.status IN ('AWAITING_ACCEPT', 'ACCEPTED', 'IN_TRANSIT')
  ) THEN
    RAISE EXCEPTION
      'Este QR já está em outra remessa em aberto (aguardando aceite, aceita ou em trânsito). Encerre ou ajuste a remessa anterior antes de incluir esta unidade outra vez.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.transferencia_itens_bloquear_dup_remessa_aberta() IS
  'Antes de INSERT em transferencia_itens: bloqueia o mesmo item_id em duas transferências com status aberto.';

DROP TRIGGER IF EXISTS transferencia_itens_bloquear_dup_remessa_aberta_trg ON public.transferencia_itens;

CREATE TRIGGER transferencia_itens_bloquear_dup_remessa_aberta_trg
  BEFORE INSERT ON public.transferencia_itens
  FOR EACH ROW
  EXECUTE PROCEDURE public.transferencia_itens_bloquear_dup_remessa_aberta();
