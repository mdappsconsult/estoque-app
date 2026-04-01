-- Migração assistida (modo compatibilidade):
-- 1) Identifica categorias que representam tipo de embalagem.
-- 2) Garante os registros em tipos_embalagem.
-- 3) Vincula produtos via produtos.embalagem_tipo_id.
-- 4) NÃO remove vínculos de categoria legados nesta fase.
--    Motivo: evitar quebra em fluxos legados que ainda dependem de produto_grupos.

WITH grupos_embalagem AS (
  SELECT
    g.id,
    g.nome,
    trim(lower(g.nome)) AS nome_norm
  FROM public.grupos g
  WHERE
    lower(g.nome) LIKE '%balde%'
    OR lower(g.nome) LIKE '%caixa%'
    OR lower(g.nome) LIKE '%pote%'
    OR lower(g.nome) LIKE '%saco%'
    OR lower(g.nome) LIKE '%fardo%'
    OR lower(g.nome) LIKE '%embalagem%'
)
INSERT INTO public.tipos_embalagem (nome)
SELECT DISTINCT ge.nome
FROM grupos_embalagem ge
WHERE ge.nome IS NOT NULL AND trim(ge.nome) <> ''
ON CONFLICT (nome) DO NOTHING;

WITH grupos_embalagem AS (
  SELECT
    g.id,
    g.nome,
    trim(lower(g.nome)) AS nome_norm
  FROM public.grupos g
  WHERE
    lower(g.nome) LIKE '%balde%'
    OR lower(g.nome) LIKE '%caixa%'
    OR lower(g.nome) LIKE '%pote%'
    OR lower(g.nome) LIKE '%saco%'
    OR lower(g.nome) LIKE '%fardo%'
    OR lower(g.nome) LIKE '%embalagem%'
),
match_produto_embalagem AS (
  SELECT DISTINCT ON (pg.produto_id)
    pg.produto_id,
    te.id AS tipo_embalagem_id
  FROM public.produto_grupos pg
  JOIN grupos_embalagem ge ON ge.id = pg.grupo_id
  JOIN public.tipos_embalagem te ON trim(lower(te.nome)) = ge.nome_norm
  ORDER BY pg.produto_id, te.nome
)
UPDATE public.produtos p
SET embalagem_tipo_id = mpe.tipo_embalagem_id
FROM match_produto_embalagem mpe
WHERE p.id = mpe.produto_id
  AND p.embalagem_tipo_id IS NULL;

-- Fase 2 (opcional e manual no futuro):
-- remover vínculos legados de categoria de embalagem em produto_grupos,
-- somente após validar que nenhum fluxo/reporte depende mais disso.
