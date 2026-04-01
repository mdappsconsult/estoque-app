-- Escopo: produtos de loja (reposição/contagem) vs cadastro tratado pela equipe da indústria
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS escopo_reposicao TEXT NOT NULL DEFAULT 'loja'
  CHECK (escopo_reposicao IN ('loja', 'industria'));

COMMENT ON COLUMN public.produtos.escopo_reposicao IS
  'loja: entra em reposição/contagem de loja. industria: excluído dessas telas.';

-- Histórico: origem só produção costuma ser SKU da indústria
UPDATE public.produtos SET escopo_reposicao = 'industria' WHERE origem = 'PRODUCAO';

DELETE FROM public.loja_contagens c
USING public.produtos p
WHERE c.produto_id = p.id AND p.escopo_reposicao = 'industria';

DELETE FROM public.loja_produtos_config cfg
USING public.produtos p
WHERE cfg.produto_id = p.id AND p.escopo_reposicao = 'industria';
