-- Compra é sempre fornecedor: corrige escopo gravado incorretamente como indústria
UPDATE public.produtos
SET escopo_reposicao = 'loja'
WHERE origem = 'COMPRA'
  AND escopo_reposicao = 'industria';
