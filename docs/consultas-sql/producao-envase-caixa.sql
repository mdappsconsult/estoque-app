-- Envase caixa: produções tipo ENVASE_CAIXA (balde → caixa, mesmo local).
-- Requer migração `20260515140000_producao_envase_caixa.sql`.

SELECT
  p.id AS producao_id,
  p.created_at,
  p.tipo,
  p.numero_lote_producao,
  p.quantidade AS num_caixas,
  p.num_baldes,
  p.envase_baldes_por_caixa AS baldes_por_caixa,
  pc.nome AS produto_caixa,
  pb.nome AS produto_balde,
  l.nome AS local_nome,
  u.nome AS registrado_por_nome,
  (SELECT COUNT(*)::int FROM public.producao_consumo_itens c WHERE c.producao_id = p.id) AS linhas_consumo_balde
FROM public.producoes p
LEFT JOIN public.produtos pc ON pc.id = p.produto_id
LEFT JOIN public.produtos pb ON pb.id = p.envase_produto_balde_id
LEFT JOIN public.locais l ON l.id = p.local_id
LEFT JOIN public.usuarios u ON u.id = p.registrado_por
WHERE p.tipo = 'ENVASE_CAIXA'
ORDER BY p.created_at DESC
LIMIT 200;
