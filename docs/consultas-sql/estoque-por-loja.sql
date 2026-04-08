-- Cruzar com a tela Estoque (filtro "Em estoque") para OPERATOR_STORE:
-- RPC `resumo_estoque_agrupado` usa estado EM_ESTOQUE e p_local_id = loja.
-- Inclui também saldo de compra ainda sem QR: soma (lotes_compra.quantidade − count(itens com aquele lote)) por produto/local (migração 20260408100000).
-- Rode no projeto Supabase de NEXT_PUBLIC_SUPABASE_URL (.env.local) — ver docs/SUPABASE_AMBIENTE_E_MCP.md

-- Listar lojas STORE (para copiar id)
-- SELECT id, nome FROM locais WHERE tipo = 'STORE' ORDER BY nome;

-- Exemplo: resumo por produto na "Loja Paraiso" (ajuste o nome na CTE)
WITH loja AS (
  SELECT id FROM locais WHERE nome = 'Loja Paraiso' AND tipo = 'STORE' LIMIT 1
)
SELECT
  p.id AS produto_id,
  p.nome AS produto_nome,
  COUNT(*)::bigint AS quantidade
FROM itens i
JOIN produtos p ON p.id = i.produto_id
WHERE i.estado = 'EM_ESTOQUE'
  AND i.local_atual_id = (SELECT id FROM loja)
GROUP BY p.id, p.nome
ORDER BY p.nome;

-- Total de unidades na mesma loja
-- WITH loja AS (SELECT id FROM locais WHERE nome = 'Loja Paraiso' AND tipo = 'STORE' LIMIT 1)
-- SELECT COUNT(*)::bigint FROM itens WHERE estado = 'EM_ESTOQUE' AND local_atual_id = (SELECT id FROM loja);
