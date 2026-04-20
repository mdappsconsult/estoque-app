-- Fusão: "Loja Paraiso" → "Loja Jardim Paraíso" (mesma unidade física).
-- IDs fixos do projeto (ajuste se reexecutar em outro ambiente):
--   Manter: 8148a1c8-0c41-4eec-a759-43427ea6f252  (Loja Jardim Paraíso)
--   Remover: 32824153-4e04-4ac5-9216-06f747be7629  (Loja Paraiso — duplicata)
--
-- Regras:
-- - loja_produtos_config: funde por (loja_id, produto_id) — GREATEST(mínimo), OR(ativo).
-- - loja_contagens: realoca (não havia produto nas duas lojas ao mesmo tempo neste caso).
-- - sequencia_balde_loja_destino: GREATEST(ultimo_numero) no destino canônico.
-- - Demais colunas que referenciam locais: UPDATE para o UUID canônico.
-- - Ao final: DELETE do local duplicado.
--
-- Aplicado no Supabase de produção em 2026-04-20 (sessão operacional).

BEGIN;

UPDATE public.loja_produtos_config canon
SET
  estoque_minimo_loja = GREATEST(canon.estoque_minimo_loja, dup.estoque_minimo_loja),
  ativo_na_loja = canon.ativo_na_loja OR dup.ativo_na_loja,
  updated_at = now()
FROM public.loja_produtos_config dup
WHERE canon.loja_id = '8148a1c8-0c41-4eec-a759-43427ea6f252'
  AND dup.loja_id = '32824153-4e04-4ac5-9216-06f747be7629'
  AND dup.produto_id = canon.produto_id;

DELETE FROM public.loja_produtos_config WHERE loja_id = '32824153-4e04-4ac5-9216-06f747be7629';

UPDATE public.loja_contagens
SET loja_id = '8148a1c8-0c41-4eec-a759-43427ea6f252'
WHERE loja_id = '32824153-4e04-4ac5-9216-06f747be7629';

INSERT INTO public.sequencia_balde_loja_destino (local_destino_id, ultimo_numero)
SELECT '8148a1c8-0c41-4eec-a759-43427ea6f252', o.ultimo_numero
FROM public.sequencia_balde_loja_destino o
WHERE o.local_destino_id = '32824153-4e04-4ac5-9216-06f747be7629'
ON CONFLICT (local_destino_id) DO UPDATE
SET ultimo_numero = GREATEST(
  public.sequencia_balde_loja_destino.ultimo_numero,
  EXCLUDED.ultimo_numero
);

DELETE FROM public.sequencia_balde_loja_destino
WHERE local_destino_id = '32824153-4e04-4ac5-9216-06f747be7629';

UPDATE public.usuarios
SET local_padrao_id = '8148a1c8-0c41-4eec-a759-43427ea6f252'
WHERE local_padrao_id = '32824153-4e04-4ac5-9216-06f747be7629';

UPDATE public.itens
SET local_atual_id = '8148a1c8-0c41-4eec-a759-43427ea6f252'
WHERE local_atual_id = '32824153-4e04-4ac5-9216-06f747be7629';

UPDATE public.transferencias
SET destino_id = '8148a1c8-0c41-4eec-a759-43427ea6f252'
WHERE destino_id = '32824153-4e04-4ac5-9216-06f747be7629';

UPDATE public.transferencias
SET origem_id = '8148a1c8-0c41-4eec-a759-43427ea6f252'
WHERE origem_id = '32824153-4e04-4ac5-9216-06f747be7629';

UPDATE public.lotes_compra
SET local_id = '8148a1c8-0c41-4eec-a759-43427ea6f252'
WHERE local_id = '32824153-4e04-4ac5-9216-06f747be7629';

UPDATE public.baixas
SET local_id = '8148a1c8-0c41-4eec-a759-43427ea6f252'
WHERE local_id = '32824153-4e04-4ac5-9216-06f747be7629';

UPDATE public.perdas
SET local_id = '8148a1c8-0c41-4eec-a759-43427ea6f252'
WHERE local_id = '32824153-4e04-4ac5-9216-06f747be7629';

UPDATE public.producoes
SET local_id = '8148a1c8-0c41-4eec-a759-43427ea6f252'
WHERE local_id = '32824153-4e04-4ac5-9216-06f747be7629';

UPDATE public.auditoria
SET local_id = '8148a1c8-0c41-4eec-a759-43427ea6f252'
WHERE local_id = '32824153-4e04-4ac5-9216-06f747be7629';

UPDATE public.auditoria
SET origem_id = '8148a1c8-0c41-4eec-a759-43427ea6f252'
WHERE origem_id = '32824153-4e04-4ac5-9216-06f747be7629';

UPDATE public.auditoria
SET destino_id = '8148a1c8-0c41-4eec-a759-43427ea6f252'
WHERE destino_id = '32824153-4e04-4ac5-9216-06f747be7629';

DELETE FROM public.locais WHERE id = '32824153-4e04-4ac5-9216-06f747be7629';

COMMIT;
