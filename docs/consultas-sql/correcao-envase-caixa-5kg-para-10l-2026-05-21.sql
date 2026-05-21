-- Correção pontual: envase 21/05/2026 20:32 BR registrado como Açaí Caixa 5kg → Caixa açaí 10L (envase)
-- Produção: ec3ed0fe-6fbe-42c2-b629-e9c3b934474e | 21 caixas, 14 baldes consumidos, lote 1
-- Aplicado via MCP em 2026-05-21

-- produto antigo: a46f4487-18a0-4a6e-a0ca-a3c648c96c52 (Açaí Caixa 5kg)
-- produto novo:  4962a1e2-70ed-4887-b738-0cc5ff7ea8b8 (Caixa açaí 10L (envase))

-- Pré-condição: todas as 21 caixas EM_ESTOQUE na Indústria, sem remessa/baixa/perda.

UPDATE producoes SET produto_id = '4962a1e2-70ed-4887-b738-0cc5ff7ea8b8'
WHERE id = 'ec3ed0fe-6fbe-42c2-b629-e9c3b934474e';

UPDATE itens SET produto_id = '4962a1e2-70ed-4887-b738-0cc5ff7ea8b8'
WHERE producao_id = 'ec3ed0fe-6fbe-42c2-b629-e9c3b934474e';

UPDATE etiquetas e SET produto_id = '4962a1e2-70ed-4887-b738-0cc5ff7ea8b8'
FROM itens i WHERE e.id = i.id AND i.producao_id = 'ec3ed0fe-6fbe-42c2-b629-e9c3b934474e';
