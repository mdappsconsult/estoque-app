-- AMBOS cadastrados como indústria costumam ter validade no produto; fornecedor zera validade no modal.
-- Corrige escopo que ficou `loja` só pelo default da coluna.
UPDATE public.produtos
SET escopo_reposicao = 'industria'
WHERE origem = 'AMBOS'
  AND escopo_reposicao = 'loja'
  AND (validade_dias > 0 OR validade_horas > 0 OR validade_minutos > 0);
