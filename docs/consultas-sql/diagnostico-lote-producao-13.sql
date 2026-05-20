-- Diagnóstico: lote de produção nº 13 (Açaí Balde 11L) — recebimento na loja
-- Rodar no Supabase do deploy (.env.local).

-- 1) Produção e saldo na indústria
SELECT
  p.id AS producao_id,
  p.numero_lote_producao,
  p.created_at AT TIME ZONE 'America/Sao_Paulo' AS producao_br,
  p.num_baldes,
  l.nome AS local_producao,
  COUNT(i.id) AS qrs,
  COUNT(*) FILTER (WHERE i.estado = 'EM_ESTOQUE') AS em_estoque_industria,
  COUNT(*) FILTER (WHERE i.estado = 'EM_TRANSFERENCIA') AS em_transferencia,
  COUNT(*) FILTER (WHERE i.local_atual_id != p.local_id) AS fora_da_industria
FROM producoes p
JOIN locais l ON l.id = p.local_id
LEFT JOIN itens i ON i.producao_id = p.id
WHERE p.numero_lote_producao = 13
GROUP BY p.id, p.numero_lote_producao, p.created_at, p.num_baldes, l.nome;

-- 2) Esses QRs estão em alguma remessa SEP?
SELECT
  t.id AS remessa_id,
  t.status,
  t.created_at AT TIME ZONE 'America/Sao_Paulo' AS remessa_br,
  lo.nome AS origem,
  ld.nome AS destino,
  COUNT(ti.item_id) AS itens_lote_13
FROM transferencia_itens ti
JOIN itens i ON i.id = ti.item_id
JOIN producoes p ON p.id = i.producao_id AND p.numero_lote_producao = 13
JOIN transferencias t ON t.id = ti.transferencia_id
LEFT JOIN locais lo ON lo.id = t.origem_id
LEFT JOIN locais ld ON ld.id = t.destino_id
GROUP BY t.id, t.status, t.created_at, lo.nome, ld.nome
ORDER BY t.created_at DESC;

-- 3) Amostra de tokens (conferir leitura manual no Recebimento)
SELECT
  i.sequencia_no_lote_producao AS balde_no_lote,
  i.token_qr,
  i.token_short,
  i.estado,
  e.lote AS lote_etiqueta
FROM itens i
JOIN producoes p ON p.id = i.producao_id AND p.numero_lote_producao = 13
LEFT JOIN etiquetas e ON e.id = i.id
ORDER BY i.sequencia_no_lote_producao
LIMIT 10;
