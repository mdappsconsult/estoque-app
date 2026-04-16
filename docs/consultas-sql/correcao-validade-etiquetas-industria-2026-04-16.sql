-- Corrige validade **15/04/2026** → **22/04/2026** para etiquetas no local **Indústria**.
--
-- Há dois cenários comuns:
-- (A) **Separação matriz → loja** (`lote` tipo `SEP-…`, ex.: Delivery): `created_at` pode ser **diferente**
--     do dia em que a equipe imprime; o filtro por «criadas dia 16» não pega tudo.
-- (B) **Produção** ou outros lotes sem `SEP-`: use o bloco (B) com a data desejada.
--
-- Rode no Supabase do **mesmo** projeto que o app (Railway / `.env.local`).

-- ============================================================================
-- (A) Indústria + remessa SEP + validade ainda 15/04/2026  (recomendado p/ Delivery)
-- ============================================================================
-- Prévia:
-- SELECT COUNT(*)::bigint
-- FROM etiquetas e
-- JOIN itens i ON i.id = e.id
-- JOIN locais l ON l.id = i.local_atual_id
-- WHERE l.nome = 'Indústria'
--   AND COALESCE(e.excluida, false) = false
--   AND (e.data_validade AT TIME ZONE 'America/Sao_Paulo')::date = DATE '2026-04-15'
--   AND e.lote LIKE 'SEP-%';

BEGIN;

UPDATE itens i
SET data_validade = '2026-04-22 00:00:00-03'::timestamptz
FROM locais l
WHERE i.local_atual_id = l.id
  AND l.nome = 'Indústria'
  AND EXISTS (
    SELECT 1
    FROM etiquetas e
    WHERE e.id = i.id
      AND COALESCE(e.excluida, false) = false
      AND (e.data_validade AT TIME ZONE 'America/Sao_Paulo')::date = DATE '2026-04-15'
      AND e.lote LIKE 'SEP-%'
  );

UPDATE etiquetas e
SET data_validade = '2026-04-22 00:00:00-03'::timestamptz
FROM itens i
JOIN locais l ON l.id = i.local_atual_id
WHERE e.id = i.id
  AND l.nome = 'Indústria'
  AND COALESCE(e.excluida, false) = false
  AND (e.data_validade AT TIME ZONE 'America/Sao_Paulo')::date = DATE '2026-04-15'
  AND e.lote LIKE 'SEP-%';

COMMIT;

-- ============================================================================
-- (B) Indústria + criadas em um dia específico + validade 15/04 (sem filtrar SEP)
-- ============================================================================
/*
BEGIN;

UPDATE itens i
SET data_validade = '2026-04-22 00:00:00-03'::timestamptz
FROM locais l
WHERE i.local_atual_id = l.id
  AND l.nome = 'Indústria'
  AND EXISTS (
    SELECT 1
    FROM etiquetas e
    WHERE e.id = i.id
      AND COALESCE(e.excluida, false) = false
      AND (e.created_at AT TIME ZONE 'America/Sao_Paulo')::date = DATE '2026-04-16'
      AND (e.data_validade AT TIME ZONE 'America/Sao_Paulo')::date = DATE '2026-04-15'
  );

UPDATE etiquetas e
SET data_validade = '2026-04-22 00:00:00-03'::timestamptz
FROM itens i
JOIN locais l ON l.id = i.local_atual_id
WHERE e.id = i.id
  AND l.nome = 'Indústria'
  AND COALESCE(e.excluida, false) = false
  AND (e.created_at AT TIME ZONE 'America/Sao_Paulo')::date = DATE '2026-04-16'
  AND (e.data_validade AT TIME ZONE 'America/Sao_Paulo')::date = DATE '2026-04-15';

COMMIT;
*/
