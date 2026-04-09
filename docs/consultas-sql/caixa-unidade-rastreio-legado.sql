-- Legado: lote com “700 unidades” quando a operação real é 1 QR por caixa
--
-- Contexto: em Registrar Compra, “Unidades rastreáveis por embalagem” alto (ex.: 700) grava
-- lotes_compra.quantidade grande; na separação o app emite um item/QR por unidade do lote.
-- Não existe merge automático de vários itens em um no aplicativo.
--
-- Antes de qualquer ajuste: backup, alinhar com gestão/auditoria e conferir transferências em aberto.
--
-- 1) Diagnosticar: quantos itens EM_ESTOQUE e QR emitidos por produto/local (ajuste produto_id / local)
/*
SELECT p.nome, l.nome AS local, i.estado, count(*)::bigint
FROM public.itens i
JOIN public.produtos p ON p.id = i.produto_id
JOIN public.locais l ON l.id = i.local_atual_id
WHERE i.produto_id = 'SUBSTITUA_UUID_PRODUTO'
GROUP BY p.nome, l.nome, i.estado
ORDER BY p.nome, l.nome, i.estado;
*/

-- 2) Lotes de compra com quantidade alta vs. itens já mintados (ajuste produto_id)
/*
SELECT lc.id, lc.quantidade AS qtd_lote, lc.created_at,
       (SELECT count(*) FROM public.itens it WHERE it.lote_compra_id = lc.id) AS itens_mintados
FROM public.lotes_compra lc
WHERE lc.produto_id = 'SUBSTITUA_UUID_PRODUTO'
ORDER BY lc.created_at DESC;
*/

-- Caminhos possíveis (escolha um com o time; não executar em bloco sem revisão):
--
-- A) Produto “novo” só para caixa (1 unidade = 1 caixa): cadastrar produto, novas compras corretas;
--    itens antigos podem ser baixados/descartados com motivo documentado ou mantidos até consumo natural.
--
-- B) Reduzir quantidade do lote (só se itens_mintados já refletir o que quer manter):
--    atualizar lotes_compra.quantidade >= contagem de itens com lote_compra_id; depois recalcular estoque agregado
--    (o app faz recálculo em vários fluxos; ver estoque-sync no código).
--
-- C) Itens fantasmas (emitidos por engano, nunca saíram fisicamente): exige política clara; opções incluem
--    marcar baixa/descarte em massa (com auditoria manual) — não há script genérico seguro aqui.
