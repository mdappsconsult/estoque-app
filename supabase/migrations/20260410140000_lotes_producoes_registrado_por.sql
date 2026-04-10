-- Quem registrou compra/produção (para filtro «só meus lançamentos» no login indústria restrito).

ALTER TABLE public.lotes_compra
  ADD COLUMN IF NOT EXISTS registrado_por UUID REFERENCES public.usuarios(id);

ALTER TABLE public.producoes
  ADD COLUMN IF NOT EXISTS registrado_por UUID REFERENCES public.usuarios(id);

CREATE INDEX IF NOT EXISTS idx_lotes_compra_registrado_por ON public.lotes_compra(registrado_por);
CREATE INDEX IF NOT EXISTS idx_producoes_registrado_por ON public.producoes(registrado_por);

UPDATE public.lotes_compra lc
SET registrado_por = a.usuario_id
FROM public.auditoria a
WHERE a.acao = 'ENTRADA_COMPRA'
  AND (a.detalhes->>'lote_compra_id') IS NOT NULL
  AND (a.detalhes->>'lote_compra_id')::uuid = lc.id
  AND a.usuario_id IS NOT NULL
  AND lc.registrado_por IS NULL;

UPDATE public.producoes p
SET registrado_por = a.usuario_id
FROM public.auditoria a
WHERE a.acao = 'PRODUCAO'
  AND (a.detalhes->>'producao_id') IS NOT NULL
  AND (a.detalhes->>'producao_id')::uuid = p.id
  AND a.usuario_id IS NOT NULL
  AND p.registrado_por IS NULL;
