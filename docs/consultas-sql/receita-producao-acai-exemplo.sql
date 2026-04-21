-- Exemplo opcional: receita «Açaí» com insumos por nome de produto (ajuste os nomes ao seu cadastro).
-- Rode após `20260421100000_producao_receitas.sql` e com produtos/família Insumo Industria já corretos.
-- Remove duplicata por nome de receita antes de inserir de novo.

-- DELETE FROM public.producao_receita_itens WHERE receita_id IN (SELECT id FROM public.producao_receitas WHERE nome = 'Açaí padrão');
-- DELETE FROM public.producao_receitas WHERE nome = 'Açaí padrão';

/*
WITH r AS (
  INSERT INTO public.producao_receitas (nome, ativo, produto_acabado_id)
  SELECT
    'Açaí padrão',
    true,
    (SELECT id FROM public.produtos WHERE lower(trim(nome)) = lower(trim('Nome do acabado açaí')) LIMIT 1)
  RETURNING id
)
INSERT INTO public.producao_receita_itens (receita_id, ordem, produto_id, qtd_qr, massa_valor)
SELECT r.id, v.ordem, p.id, v.qtd_qr, v.massa_valor
FROM r
CROSS JOIN (VALUES
  (0, 'Polpa de acai 1 kilo', 280::int, NULL::text),
  (1, 'Acucar cristal 5kg', NULL::int, '60000'::text),
  (2, 'Forte Base Fruta Roxo Ultra 2.0', NULL::int, '1'::text),
  (3, 'Forte base Fruta Citrus 2.0', NULL::int, '1'::text),
  (4, 'Aroma Artificial de Guarana com Extrato', NULL::int, '450'::text),
  (5, 'Acido Citrico', NULL::int, '450'::text)
) AS v(ordem, nome_produto, qtd_qr, massa_valor)
JOIN public.produtos p ON lower(trim(p.nome)) = lower(trim(v.nome_produto));
*/
