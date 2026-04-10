-- Reabre remessa(s) matriz → Loja Jardim Paraíso do dia 09/04/2026 (America/Sao_Paulo)
-- que ficaram em DIVERGENCE por fluxo antigo do motorista / recebimento indevido.
-- Remove linhas em divergencias, zera recebido, recoloca itens na origem EM_TRANSFERENCIA, status IN_TRANSIT.
-- Ajuste destino_id / data se precisar repetir para outro caso.

WITH alvo AS (
  SELECT t.id AS transferencia_id, t.origem_id
  FROM public.transferencias t
  WHERE t.tipo = 'WAREHOUSE_STORE'
    AND t.status = 'DIVERGENCE'
    AND t.destino_id = '8148a1c8-0c41-4eec-a759-43427ea6f252'
    AND (t.created_at AT TIME ZONE 'America/Sao_Paulo')::date = DATE '2026-04-09'
)
DELETE FROM public.divergencias d
WHERE d.transferencia_id IN (SELECT transferencia_id FROM alvo);

WITH alvo AS (
  SELECT t.id AS transferencia_id, t.origem_id
  FROM public.transferencias t
  WHERE t.tipo = 'WAREHOUSE_STORE'
    AND t.destino_id = '8148a1c8-0c41-4eec-a759-43427ea6f252'
    AND (t.created_at AT TIME ZONE 'America/Sao_Paulo')::date = DATE '2026-04-09'
)
UPDATE public.transferencia_itens ti
SET recebido = false
FROM alvo a
WHERE ti.transferencia_id = a.transferencia_id;

WITH alvo AS (
  SELECT t.id AS transferencia_id, t.origem_id
  FROM public.transferencias t
  WHERE t.tipo = 'WAREHOUSE_STORE'
    AND t.destino_id = '8148a1c8-0c41-4eec-a759-43427ea6f252'
    AND (t.created_at AT TIME ZONE 'America/Sao_Paulo')::date = DATE '2026-04-09'
)
UPDATE public.itens i
SET
  estado = 'EM_TRANSFERENCIA',
  local_atual_id = a.origem_id
FROM public.transferencia_itens ti
INNER JOIN alvo a ON a.transferencia_id = ti.transferencia_id
WHERE i.id = ti.item_id;

WITH alvo AS (
  SELECT t.id AS transferencia_id
  FROM public.transferencias t
  WHERE t.tipo = 'WAREHOUSE_STORE'
    AND t.destino_id = '8148a1c8-0c41-4eec-a759-43427ea6f252'
    AND (t.created_at AT TIME ZONE 'America/Sao_Paulo')::date = DATE '2026-04-09'
)
UPDATE public.transferencias tr
SET status = 'IN_TRANSIT'
FROM alvo a
WHERE tr.id = a.transferencia_id;
