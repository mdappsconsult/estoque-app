-- Corrige remessas matriz → loja que ficaram em ACCEPTED após o motorista aceitar a viagem
-- (fluxo antigo sem «Iniciar viagem»). Itens EM_ESTOQUE → EM_TRANSFERENCIA; remessas e viagem → IN_TRANSIT.
-- Idempotente: ignora remessas já IN_TRANSIT / entregues.

WITH stuck AS (
  SELECT t.id AS transferencia_id
  FROM public.transferencias t
  INNER JOIN public.viagens v ON v.id = t.viagem_id
  WHERE t.tipo = 'WAREHOUSE_STORE'
    AND t.status = 'ACCEPTED'
    AND v.status IN ('ACCEPTED', 'IN_TRANSIT')
)
UPDATE public.itens i
SET estado = 'EM_TRANSFERENCIA'
FROM public.transferencia_itens ti
INNER JOIN stuck s ON s.transferencia_id = ti.transferencia_id
WHERE i.id = ti.item_id
  AND i.estado = 'EM_ESTOQUE';

WITH stuck AS (
  SELECT t.id AS transferencia_id
  FROM public.transferencias t
  INNER JOIN public.viagens v ON v.id = t.viagem_id
  WHERE t.tipo = 'WAREHOUSE_STORE'
    AND t.status = 'ACCEPTED'
    AND v.status IN ('ACCEPTED', 'IN_TRANSIT')
)
UPDATE public.transferencias tr
SET status = 'IN_TRANSIT'
FROM stuck s
WHERE tr.id = s.transferencia_id;

UPDATE public.viagens v
SET status = 'IN_TRANSIT'
WHERE v.status = 'ACCEPTED'
  AND NOT EXISTS (
    SELECT 1
    FROM public.transferencias t
    WHERE t.viagem_id = v.id
      AND t.status IN ('AWAITING_ACCEPT', 'ACCEPTED')
  );
