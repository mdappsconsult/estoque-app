-- Desfaz alteração indevida no local **Estoque**: etiquetas de **16/04/2026** que foram
-- passadas para **22/04** voltam para **15/04/2026** (etiquetas + itens).
-- Rode no Supabase onde isso ocorreu (ex.: após script antigo que usava só `tipo = WAREHOUSE`).
--
-- Prévia:
-- SELECT COUNT(*)::bigint
-- FROM etiquetas e
-- JOIN itens i ON i.id = e.id
-- JOIN locais l ON l.id = i.local_atual_id
-- WHERE l.nome = 'Estoque'
--   AND COALESCE(e.excluida, false) = false
--   AND (e.created_at AT TIME ZONE 'America/Sao_Paulo')::date = DATE '2026-04-16'
--   AND (e.data_validade AT TIME ZONE 'America/Sao_Paulo')::date = DATE '2026-04-22';

BEGIN;

UPDATE etiquetas e
SET data_validade = '2026-04-15 00:00:00-03'::timestamptz
FROM itens i
JOIN locais l ON l.id = i.local_atual_id
WHERE e.id = i.id
  AND l.nome = 'Estoque'
  AND COALESCE(e.excluida, false) = false
  AND (e.created_at AT TIME ZONE 'America/Sao_Paulo')::date = DATE '2026-04-16'
  AND (e.data_validade AT TIME ZONE 'America/Sao_Paulo')::date = DATE '2026-04-22';

UPDATE itens i
SET data_validade = '2026-04-15 00:00:00-03'::timestamptz
FROM locais l
WHERE i.local_atual_id = l.id
  AND l.nome = 'Estoque'
  AND (i.data_validade AT TIME ZONE 'America/Sao_Paulo')::date = DATE '2026-04-22'
  AND EXISTS (
    SELECT 1
    FROM etiquetas e
    WHERE e.id = i.id
      AND COALESCE(e.excluida, false) = false
      AND (e.created_at AT TIME ZONE 'America/Sao_Paulo')::date = DATE '2026-04-16'
  );

COMMIT;
