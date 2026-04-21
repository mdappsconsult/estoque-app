-- Relatório gerencial: baldes (itens produzidos na indústria) por loja/produto
-- Objetivo: saldo agora (indústria, em trânsito, na loja) + utilizados (baixas) no período.

DROP FUNCTION IF EXISTS public.relatorio_baldes(date, date, uuid, uuid, boolean, uuid);

CREATE OR REPLACE FUNCTION public.relatorio_baldes(
  p_data_ini date,
  p_data_fim date,
  p_loja_id uuid DEFAULT NULL,
  p_produto_id uuid DEFAULT NULL,
  p_apenas_nome_balde boolean DEFAULT true,
  p_local_industria_id uuid DEFAULT NULL
)
RETURNS TABLE (
  loja_id uuid,
  loja_nome text,
  produto_id uuid,
  produto_nome text,
  qtd_industria_em_estoque bigint,
  qtd_loja_em_estoque bigint,
  qtd_em_transferencia_para_loja bigint,
  qtd_utilizados_periodo bigint
)
LANGUAGE sql
STABLE
AS $fn$
WITH
permissao AS (
  SELECT
    COALESCE(auth.role(), '') AS jwt_role,
    (
      SELECT u.perfil
      FROM public.usuarios u
      WHERE u.id = auth.uid()
      LIMIT 1
    ) AS perfil
),
perm_ok AS (
  SELECT 1 AS ok
  FROM permissao p
  WHERE p.jwt_role = 'service_role' OR p.perfil IN ('ADMIN_MASTER', 'MANAGER')
),
params AS (
  SELECT
    COALESCE(p_data_ini, CURRENT_DATE) AS data_ini,
    COALESCE(p_data_fim, CURRENT_DATE) AS data_fim
),
filtro_prod AS (
  SELECT
    p.id AS produto_id,
    p.nome AS produto_nome
  FROM public.produtos p
  JOIN perm_ok _p ON true
  WHERE (p_produto_id IS NULL OR p.id = p_produto_id)
    AND (
      NOT COALESCE(p_apenas_nome_balde, true)
      OR p.nome ~* '\\mbalde\\M'
    )
),
-- Saldo atual na indústria (por produto) — itens produzidos (producao_id != null)
industria_em_estoque AS (
  SELECT
    i.produto_id,
    count(*)::bigint AS qtd
  FROM public.itens i
  JOIN filtro_prod fp ON fp.produto_id = i.produto_id
  JOIN public.locais l ON l.id = i.local_atual_id
  WHERE i.producao_id IS NOT NULL
    AND i.estado = 'EM_ESTOQUE'
    AND l.tipo = 'WAREHOUSE'
    AND (p_local_industria_id IS NULL OR l.id = p_local_industria_id)
  GROUP BY i.produto_id
),
-- Saldo atual na(s) loja(s) (por loja/produto)
loja_em_estoque AS (
  SELECT
    i.local_atual_id AS loja_id,
    i.produto_id,
    count(*)::bigint AS qtd
  FROM public.itens i
  JOIN filtro_prod fp ON fp.produto_id = i.produto_id
  JOIN public.locais l ON l.id = i.local_atual_id
  WHERE i.producao_id IS NOT NULL
    AND i.estado = 'EM_ESTOQUE'
    AND l.tipo = 'STORE'
    AND (p_loja_id IS NULL OR l.id = p_loja_id)
  GROUP BY i.local_atual_id, i.produto_id
),
-- Vínculo aberto mais recente por item em remessas WAREHOUSE_STORE (evita dupla contagem com histórico de dupla reserva)
transfer_aberta_mais_recente AS (
  SELECT DISTINCT ON (ti.item_id)
    ti.item_id,
    t.destino_id AS loja_id,
    t.created_at
  FROM public.transferencia_itens ti
  JOIN public.transferencias t ON t.id = ti.transferencia_id
  WHERE t.tipo = 'WAREHOUSE_STORE'
    AND t.status IN ('AWAITING_ACCEPT', 'ACCEPTED', 'IN_TRANSIT')
  ORDER BY ti.item_id, t.created_at DESC
),
-- Saldo atual em trânsito por loja/produto
em_transito_para_loja AS (
  SELECT
    x.loja_id,
    i.produto_id,
    count(*)::bigint AS qtd
  FROM transfer_aberta_mais_recente x
  JOIN public.itens i ON i.id = x.item_id
  JOIN filtro_prod fp ON fp.produto_id = i.produto_id
  WHERE i.producao_id IS NOT NULL
    AND i.estado = 'EM_TRANSFERENCIA'
    AND (p_loja_id IS NULL OR x.loja_id = p_loja_id)
  GROUP BY x.loja_id, i.produto_id
),
-- Utilizados (baixas) no período por loja/produto
utilizados_periodo AS (
  SELECT
    b.local_id AS loja_id,
    i.produto_id,
    count(*)::bigint AS qtd
  FROM public.baixas b
  JOIN public.itens i ON i.id = b.item_id
  JOIN filtro_prod fp ON fp.produto_id = i.produto_id
  JOIN params p ON true
  JOIN public.locais l ON l.id = b.local_id
  WHERE i.producao_id IS NOT NULL
    AND l.tipo = 'STORE'
    AND (p_loja_id IS NULL OR b.local_id = p_loja_id)
    AND b.created_at >= (p.data_ini)::timestamptz
    AND b.created_at < ((p.data_fim + 1))::timestamptz
  GROUP BY b.local_id, i.produto_id
),
-- Chaves (loja/produto) que existem em qualquer bloco do relatório
chaves AS (
  SELECT loja_id, produto_id FROM loja_em_estoque
  UNION
  SELECT loja_id, produto_id FROM em_transito_para_loja
  UNION
  SELECT loja_id, produto_id FROM utilizados_periodo
),
lojas AS (
  SELECT id, nome
  FROM public.locais
  WHERE tipo = 'STORE'
)
SELECT
  c.loja_id,
  lj.nome AS loja_nome,
  c.produto_id,
  fp.produto_nome,
  COALESCE(ind.qtd, 0)::bigint AS qtd_industria_em_estoque,
  COALESCE(le.qtd, 0)::bigint AS qtd_loja_em_estoque,
  COALESCE(tr.qtd, 0)::bigint AS qtd_em_transferencia_para_loja,
  COALESCE(u.qtd, 0)::bigint AS qtd_utilizados_periodo
FROM chaves c
JOIN lojas lj ON lj.id = c.loja_id
JOIN filtro_prod fp ON fp.produto_id = c.produto_id
LEFT JOIN industria_em_estoque ind ON ind.produto_id = c.produto_id
LEFT JOIN loja_em_estoque le ON le.loja_id = c.loja_id AND le.produto_id = c.produto_id
LEFT JOIN em_transito_para_loja tr ON tr.loja_id = c.loja_id AND tr.produto_id = c.produto_id
LEFT JOIN utilizados_periodo u ON u.loja_id = c.loja_id AND u.produto_id = c.produto_id
ORDER BY lj.nome ASC, fp.produto_nome ASC;
$fn$;

COMMENT ON FUNCTION public.relatorio_baldes(date, date, uuid, uuid, boolean, uuid) IS
  'Relatório baldes: itens produzidos (itens.producao_id != null). Retorna por loja/produto: saldo agora (indústria/loja/trânsito) e baixas no período.';

GRANT EXECUTE ON FUNCTION public.relatorio_baldes(date, date, uuid, uuid, boolean, uuid) TO anon, authenticated, service_role;

