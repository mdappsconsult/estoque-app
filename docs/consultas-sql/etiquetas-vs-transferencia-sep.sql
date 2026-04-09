-- Diagnóstico: comparar transferência(ões) matriz→loja da viagem vs etiquetas ativas no lote SEP-{uuid}.
-- Ajuste o UUID em `args` (mesmo valor que vem depois de SEP- no lote).

WITH args AS (
  SELECT '00000000-0000-0000-0000-000000000000'::uuid AS viagem_id -- <<< substitua
),
tr AS (
  SELECT t.id, t.destino_id, t.created_at
  FROM transferencias t
  CROSS JOIN args a
  WHERE t.tipo = 'WAREHOUSE_STORE' AND t.viagem_id = a.viagem_id
),
ti AS (
  SELECT ti.item_id, ti.transferencia_id
  FROM transferencia_itens ti
  INNER JOIN tr ON tr.id = ti.transferencia_id
),
dist AS (SELECT DISTINCT item_id FROM ti)
SELECT
  (SELECT count(*) FROM tr) AS qtd_transferencias,
  (SELECT count(*) FROM ti) AS linhas_transferencia_itens,
  (SELECT count(*) FROM dist) AS itens_distintos,
  (
    SELECT count(*)
    FROM etiquetas e
    CROSS JOIN args a
    INNER JOIN dist d ON d.item_id = e.id
    WHERE e.excluida = false AND e.lote = 'SEP-' || a.viagem_id::text
  ) AS etiquetas_ativas_mesmo_lote;
