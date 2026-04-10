-- Ao remover a última transferência de uma viagem, elimina a viagem órfã e marca etiquetas SEP-{viagem} como excluídas.
-- Limpeza única: viagens já órfãs no banco + etiquetas do lote correspondente.

CREATE OR REPLACE FUNCTION public.prune_viagem_apos_delete_transferencia()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_lote text;
BEGIN
  IF OLD.viagem_id IS NULL THEN
    RETURN OLD;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.transferencias t
    WHERE t.viagem_id = OLD.viagem_id
  ) THEN
    RETURN OLD;
  END IF;

  v_lote := 'SEP-' || OLD.viagem_id::text;

  UPDATE public.etiquetas
  SET excluida = true
  WHERE lote = v_lote
    AND excluida IS NOT TRUE;

  DELETE FROM public.viagens
  WHERE id = OLD.viagem_id;

  RETURN OLD;
END;
$fn$;

COMMENT ON FUNCTION public.prune_viagem_apos_delete_transferencia() IS
  'Após DELETE em transferencias: se não restar remessa na viagem, marca etiquetas SEP-{uuid} excluídas e apaga a viagem.';

DROP TRIGGER IF EXISTS transferencias_after_delete_prune_viagem ON public.transferencias;

CREATE TRIGGER transferencias_after_delete_prune_viagem
  AFTER DELETE ON public.transferencias
  FOR EACH ROW
  EXECUTE PROCEDURE public.prune_viagem_apos_delete_transferencia();

-- Limpeza pontual: viagens sem nenhuma transferência + etiquetas do lote SEP-{id}
WITH orfas AS (
  SELECT v.id
  FROM public.viagens v
  WHERE NOT EXISTS (
    SELECT 1 FROM public.transferencias t WHERE t.viagem_id = v.id
  )
)
UPDATE public.etiquetas e
SET excluida = true
WHERE e.excluida IS NOT TRUE
  AND e.lote IN (SELECT 'SEP-' || o.id::text FROM orfas o);

DELETE FROM public.viagens v
WHERE NOT EXISTS (
  SELECT 1 FROM public.transferencias t WHERE t.viagem_id = v.id
);
