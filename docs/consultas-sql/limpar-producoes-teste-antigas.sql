-- Limpeza: produções de teste com mais de 7 dias + unidades acabado (baldes) ligadas a elas.
-- Ajuste o intervalo se precisar (ex.: interval '14 days').
-- Ordem: transferência do item (se houver) → etiquetas → itens → producoes.
-- Depois: recalcular `estoque` agregado dos produtos afetados (exemplo no final).

-- 1) Itens acabado a remover (heurística: mesmo produto_id da produção, sem lote_compra,
--    criados até 15 min após o registro da produção; até `quantidade` linhas por produção).
-- 2) Remover vínculos em transferência (e transferências órfãs se ficarem vazias).

-- DELETE transferencia_itens
-- DELETE FROM transferencia_itens ti WHERE ti.item_id IN ( ... subquery matched ... );

-- DELETE FROM etiquetas e WHERE e.id IN ( ... );

-- DELETE FROM itens i WHERE i.id IN ( ... );

-- DELETE FROM producoes WHERE created_at < now() - interval '7 days';

-- Recalcular estoque agregado (substitua os UUIDs pelos produto_id que participaram):
-- UPDATE estoque e SET quantidade = (SELECT COUNT(*)::int FROM itens WHERE produto_id = e.produto_id AND estado = 'EM_ESTOQUE'), updated_at = now()
-- WHERE produto_id IN (...);
