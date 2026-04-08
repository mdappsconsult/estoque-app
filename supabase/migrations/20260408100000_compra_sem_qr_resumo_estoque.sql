-- Compra: data de validade no lote (para emitir QR depois); resumo de estoque inclui saldo "a etiquetar"

ALTER TABLE public.lotes_compra
  ADD COLUMN IF NOT EXISTS data_validade date;

CREATE INDEX IF NOT EXISTS idx_lotes_compra_produto_local_created
  ON public.lotes_compra(produto_id, local_id, created_at);

-- Itens já emitidos por lote (consomem o saldo do lote)
-- Recria agregação: itens EM_ESTOQUE + (quantidade do lote − já emitidos), por produto/local

DROP FUNCTION IF EXISTS public.resumo_estoque_agrupado(text, uuid, text);

CREATE OR REPLACE FUNCTION public.resumo_estoque_agrupado(
  p_estado text DEFAULT NULL,
  p_local_id uuid DEFAULT NULL,
  p_busca text DEFAULT NULL
)
RETURNS TABLE (
  produto_id uuid,
  produto_nome text,
  local_id uuid,
  local_nome text,
  local_tipo text,
  quantidade bigint,
  proxima_validade timestamptz
)
LANGUAGE sql
STABLE
AS $fn$
WITH
estado_filtro AS (
  SELECT COALESCE(NULLIF(trim(p_estado), ''), 'EM_ESTOQUE') AS v
),
mint AS (
  SELECT i.lote_compra_id, count(*)::bigint AS cnt
  FROM public.itens i
  WHERE i.lote_compra_id IS NOT NULL
  GROUP BY i.lote_compra_id
),
bulk_by_lote AS (
  SELECT
    lc.produto_id,
    lc.local_id,
    GREATEST(0, lc.quantidade - COALESCE(m.cnt, 0))::bigint AS q_bulk,
    lc.data_validade::timestamptz AS val_lote
  FROM public.lotes_compra lc
  LEFT JOIN mint m ON m.lote_compra_id = lc.id
),
bulk_agg AS (
  SELECT
    b.produto_id,
    b.local_id,
    SUM(b.q_bulk)::bigint AS q,
    MIN(b.val_lote) FILTER (WHERE b.val_lote IS NOT NULL) AS prox_val
  FROM bulk_by_lote b
  WHERE b.q_bulk > 0
  GROUP BY b.produto_id, b.local_id
),
item_agg AS (
  SELECT
    i.produto_id,
    i.local_atual_id AS local_id,
    count(*)::bigint AS q,
    MIN(i.data_validade) AS prox_val
  FROM public.itens i
  CROSS JOIN estado_filtro ef
  WHERE i.estado = ef.v
  GROUP BY i.produto_id, i.local_atual_id
),
bulk_filtered AS (
  SELECT ba.produto_id, ba.local_id, ba.q, ba.prox_val
  FROM bulk_agg ba
  CROSS JOIN estado_filtro ef
  WHERE ef.v = 'EM_ESTOQUE'
),
combined AS (
  SELECT ia.produto_id, ia.local_id, ia.q, ia.prox_val FROM item_agg ia
  UNION ALL
  SELECT bf.produto_id, bf.local_id, bf.q, bf.prox_val FROM bulk_filtered bf
),
merged AS (
  SELECT
    c.produto_id,
    c.local_id,
    SUM(c.q)::bigint AS quantidade,
    MIN(c.prox_val) AS proxima_validade
  FROM combined c
  GROUP BY c.produto_id, c.local_id
)
SELECT
  m.produto_id,
  p.nome AS produto_nome,
  m.local_id,
  l.nome AS local_nome,
  l.tipo AS local_tipo,
  m.quantidade,
  m.proxima_validade
FROM merged m
JOIN public.produtos p ON p.id = m.produto_id
LEFT JOIN public.locais l ON l.id = m.local_id
WHERE m.quantidade > 0
  AND (p_local_id IS NULL OR m.local_id IS NOT DISTINCT FROM p_local_id)
  AND (
    p_busca IS NULL OR trim(p_busca) = '' OR p.nome ILIKE '%' || trim(p_busca) || '%'
  )
ORDER BY p.nome ASC, l.nome ASC NULLS LAST;
$fn$;

COMMENT ON FUNCTION public.resumo_estoque_agrupado(text, uuid, text) IS
  'Estoque por produto/local: itens no estado filtrado + saldo de compra ainda não emitido como QR (lotes_compra).';

DROP FUNCTION IF EXISTS public.resumo_estoque_minimo(uuid, text, boolean);

CREATE OR REPLACE FUNCTION public.resumo_estoque_minimo(
  p_local_id uuid DEFAULT NULL,
  p_busca text DEFAULT NULL,
  p_apenas_abaixo boolean DEFAULT true
)
RETURNS TABLE (
  produto_id uuid,
  produto_nome text,
  local_id uuid,
  local_nome text,
  local_tipo text,
  quantidade_atual bigint,
  estoque_minimo integer,
  faltante bigint
)
LANGUAGE sql
STABLE
AS $fn$
SELECT
  s.produto_id,
  s.produto_nome,
  s.local_id,
  s.local_nome,
  s.local_tipo,
  s.quantidade AS quantidade_atual,
  p.estoque_minimo,
  GREATEST(0, (p.estoque_minimo)::bigint - s.quantidade)::bigint AS faltante
FROM public.resumo_estoque_agrupado('EM_ESTOQUE'::text, p_local_id, p_busca) s
JOIN public.produtos p ON p.id = s.produto_id
WHERE p.estoque_minimo > 0
  AND (
    NOT p_apenas_abaixo OR s.quantidade < p.estoque_minimo
  )
ORDER BY faltante DESC, s.produto_nome;
$fn$;

GRANT EXECUTE ON FUNCTION public.resumo_estoque_agrupado(text, uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resumo_estoque_minimo(uuid, text, boolean) TO anon, authenticated, service_role;
