-- Modelo canônico acordado:
-- - Família do produto: tabela `familias` + coluna `produtos.familia_id` (nova).
-- - Tipo de embalagem: tabela legada `grupos` + vínculo `produto_grupos` (somente embalagem).
-- Remove `tipos_embalagem` e `produtos.embalagem_tipo_id` após migrar dados.

CREATE OR REPLACE FUNCTION public._migr_grupo_e_embalagem(p_nome text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  n text := lower(trim(p_nome));
BEGIN
  IF EXISTS (SELECT 1 FROM public.tipos_embalagem te WHERE lower(trim(te.nome)) = n) THEN
    RETURN true;
  END IF;
  RETURN
    n LIKE '%balde%'
    OR n LIKE '%caixa%'
    OR n LIKE '%pote%'
    OR n LIKE '%saco%'
    OR n LIKE '%fardo%'
    OR n LIKE '%embalagem%';
END;
$$;

-- Famílias (nova tabela)
CREATE TABLE IF NOT EXISTS public.familias (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  cor TEXT NOT NULL DEFAULT '#3b82f6',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT familias_nome_unique UNIQUE (nome)
);

ALTER TABLE public.familias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_familias" ON public.familias;
CREATE POLICY "allow_all_familias" ON public.familias
  FOR ALL USING (true) WITH CHECK (true);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.familias;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Cadastro de famílias a partir de grupos que NÃO são embalagem (uma linha por nome normalizado)
INSERT INTO public.familias (nome, cor)
SELECT DISTINCT ON (lower(trim(g.nome)))
  trim(g.nome),
  g.cor
FROM public.grupos g
WHERE NOT public._migr_grupo_e_embalagem(g.nome)
ORDER BY lower(trim(g.nome)), g.created_at
ON CONFLICT (nome) DO NOTHING;

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS familia_id UUID REFERENCES public.familias(id);

CREATE INDEX IF NOT EXISTS idx_produtos_familia_id ON public.produtos(familia_id);

-- Preencher familia_id a partir do primeiro vínculo de produto_grupos que era família
WITH first_fam AS (
  SELECT DISTINCT ON (pg.produto_id)
    pg.produto_id,
    trim(g.nome) AS nome_grupo
  FROM public.produto_grupos pg
  JOIN public.grupos g ON g.id = pg.grupo_id
  WHERE NOT public._migr_grupo_e_embalagem(g.nome)
  ORDER BY pg.produto_id, g.nome
)
UPDATE public.produtos p
SET familia_id = f.id
FROM first_fam ff
JOIN public.familias f ON lower(trim(f.nome)) = lower(trim(ff.nome_grupo))
WHERE p.id = ff.produto_id
  AND p.familia_id IS NULL;

-- Garantir linha em `grupos` para cada nome em tipos_embalagem (para unificar em grupos)
INSERT INTO public.grupos (nome, cor)
SELECT te.nome, '#64748b'
FROM public.tipos_embalagem te
WHERE NOT EXISTS (
  SELECT 1 FROM public.grupos g WHERE lower(trim(g.nome)) = lower(trim(te.nome))
);

-- Copiar vínculo de embalagem do campo novo para produto_grupos
INSERT INTO public.produto_grupos (produto_id, grupo_id)
SELECT p.id, g.id
FROM public.produtos p
JOIN public.tipos_embalagem te ON te.id = p.embalagem_tipo_id
JOIN public.grupos g ON lower(trim(g.nome)) = lower(trim(te.nome))
ON CONFLICT (produto_id, grupo_id) DO NOTHING;

-- Remover vínculos que eram família (agora em familia_id)
DELETE FROM public.produto_grupos pg
USING public.grupos g
WHERE pg.grupo_id = g.id
  AND NOT public._migr_grupo_e_embalagem(g.nome);

-- Grupos órfãos de família (sem produto_grupos): remover da tabela grupos
DELETE FROM public.grupos g
WHERE NOT public._migr_grupo_e_embalagem(g.nome)
  AND NOT EXISTS (SELECT 1 FROM public.produto_grupos pg WHERE pg.grupo_id = g.id);

-- Remover coluna e tabela antigas de tipo de embalagem paralela
ALTER TABLE public.produtos DROP CONSTRAINT IF EXISTS produtos_embalagem_tipo_id_fkey;
DROP INDEX IF EXISTS idx_produtos_embalagem_tipo_id;
ALTER TABLE public.produtos DROP COLUMN IF EXISTS embalagem_tipo_id;

DROP FUNCTION IF EXISTS public._migr_grupo_e_embalagem(text);

ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.tipos_embalagem;

DROP TABLE IF EXISTS public.tipos_embalagem;
