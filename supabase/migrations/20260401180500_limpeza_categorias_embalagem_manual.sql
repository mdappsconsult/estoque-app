-- Fase 2 (manual e opcional):
-- Este script remove vínculos legados de categorias de embalagem em produto_grupos.
-- Execute SOMENTE quando toda a operação e relatórios já estiverem usando
-- produtos.embalagem_tipo_id/tipos_embalagem como fonte canônica.

WITH grupos_embalagem AS (
  SELECT g.id
  FROM public.grupos g
  WHERE
    lower(g.nome) LIKE '%balde%'
    OR lower(g.nome) LIKE '%caixa%'
    OR lower(g.nome) LIKE '%pote%'
    OR lower(g.nome) LIKE '%saco%'
    OR lower(g.nome) LIKE '%fardo%'
    OR lower(g.nome) LIKE '%embalagem%'
)
DELETE FROM public.produto_grupos pg
USING grupos_embalagem ge
WHERE pg.grupo_id = ge.id;
