-- Tela Etiquetas: opções de remessa SEP sem varrer milhares de linhas (uma linha por lote).
CREATE OR REPLACE FUNCTION public.etiquetas_lotes_sep_recentes(p_limit integer DEFAULT 150)
RETURNS TABLE(lote text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT e.lote::text AS lote, max(e.created_at) AS created_at
  FROM public.etiquetas e
  WHERE e.excluida = false
    AND e.lote IS NOT NULL
    AND e.lote LIKE 'SEP-%'
  GROUP BY e.lote
  ORDER BY max(e.created_at) DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 150), 1), 300);
$$;

COMMENT ON FUNCTION public.etiquetas_lotes_sep_recentes(integer) IS
  'Lotes SEP distintos (max created_at por lote) para o select de remessas em /etiquetas.';

CREATE INDEX IF NOT EXISTS idx_etiquetas_sep_lote_created_partial
  ON public.etiquetas (lote, created_at DESC)
  WHERE excluida = false AND lote IS NOT NULL AND lote LIKE 'SEP-%';

GRANT EXECUTE ON FUNCTION public.etiquetas_lotes_sep_recentes(integer) TO anon, authenticated, service_role;
