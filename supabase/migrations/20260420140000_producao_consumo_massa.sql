-- Produção: consumo por massa (g) em lotes de compra + saldo parcial por embalagem.
-- `lotes_compra.quantidade` = unidades físicas (caixas/sacos); cada uma pesa `producao_gramas_por_embalagem` g.

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS producao_consumo_por_massa boolean NOT NULL DEFAULT false;

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS producao_gramas_por_embalagem integer NULL;

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS producao_gramas_por_dose integer NULL;

COMMENT ON COLUMN public.produtos.producao_consumo_por_massa IS
  'Se true, na produção o insumo pode ser baixado por gramas (lote de compra) em vez de só QR.';
COMMENT ON COLUMN public.produtos.producao_gramas_por_embalagem IS
  'Gramas por unidade de compra (caixa/saco). Obrigatório se producao_consumo_por_massa.';
COMMENT ON COLUMN public.produtos.producao_gramas_por_dose IS
  'Gramas por dose na receita; 0 ou NULL = operador informa kg na produção; >0 = informa doses.';

ALTER TABLE public.lotes_compra
  ADD COLUMN IF NOT EXISTS gramas_consumidas_acumulado integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.lotes_compra.gramas_consumidas_acumulado IS
  'Total de gramas já consumidas deste lote via produção (consumo por massa).';

CREATE TABLE IF NOT EXISTS public.producao_consumo_massa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producao_id uuid NOT NULL REFERENCES public.producoes(id) ON DELETE CASCADE,
  produto_id uuid NOT NULL REFERENCES public.produtos(id),
  gramas_consumidas integer NOT NULL CHECK (gramas_consumidas > 0),
  detalhes_lotes jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_producao_consumo_massa_producao
  ON public.producao_consumo_massa(producao_id);

CREATE INDEX IF NOT EXISTS idx_producao_consumo_massa_produto
  ON public.producao_consumo_massa(produto_id);

ALTER TABLE public.producao_consumo_massa ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_producao_consumo_massa" ON public.producao_consumo_massa;
CREATE POLICY "allow_all_producao_consumo_massa" ON public.producao_consumo_massa
  FOR ALL USING (true) WITH CHECK (true);

-- Idempotente: re-execução não falha se a tabela já estiver na publicação.
DO $pub$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.producao_consumo_massa;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $pub$;

-- Atualiza resumo: lotes «por massa» usam embalagens equivalentes após consumo em gramas.
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
    CASE
      WHEN COALESCE(p.producao_consumo_por_massa, false) = true
        AND COALESCE(p.producao_gramas_por_embalagem, 0) > 0
      THEN
        GREATEST(0,
          CEIL(
            GREATEST(0,
              (GREATEST(0, lc.quantidade - COALESCE(m.cnt, 0)))::bigint
              * p.producao_gramas_por_embalagem::bigint
              - COALESCE(lc.gramas_consumidas_acumulado, 0)::bigint
            )::numeric
            / NULLIF(p.producao_gramas_por_embalagem::numeric, 0)
          )
        )::bigint
      ELSE
        GREATEST(0, lc.quantidade - COALESCE(m.cnt, 0))::bigint
    END AS q_bulk,
    lc.data_validade::timestamptz AS val_lote
  FROM public.lotes_compra lc
  JOIN public.produtos p ON p.id = lc.produto_id
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
  'Estoque por produto/local: itens no estado filtrado + saldo de compra (QR ou massa por embalagem).';

GRANT EXECUTE ON FUNCTION public.resumo_estoque_agrupado(text, uuid, text) TO anon, authenticated, service_role;
