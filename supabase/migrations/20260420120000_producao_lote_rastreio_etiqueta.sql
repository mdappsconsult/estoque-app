-- Lote de produção sequencial (rastreio) + vínculo item→produção + campos na etiqueta (preservados no SEP)

CREATE TABLE IF NOT EXISTS public.sequencia_lote_producao (
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  local_id UUID NOT NULL REFERENCES public.locais(id) ON DELETE CASCADE,
  ultimo_numero INTEGER NOT NULL DEFAULT 0 CHECK (ultimo_numero >= 0),
  PRIMARY KEY (produto_id, local_id)
);

ALTER TABLE public.sequencia_lote_producao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_sequencia_lote_producao" ON public.sequencia_lote_producao;
CREATE POLICY "allow_all_sequencia_lote_producao" ON public.sequencia_lote_producao
  FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.reservar_numero_lote_producao(p_produto_id uuid, p_local_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next integer;
BEGIN
  IF p_produto_id IS NULL OR p_local_id IS NULL THEN
    RAISE EXCEPTION 'produto_id e local_id são obrigatórios';
  END IF;

  INSERT INTO public.sequencia_lote_producao (produto_id, local_id, ultimo_numero)
  VALUES (p_produto_id, p_local_id, 1)
  ON CONFLICT (produto_id, local_id) DO UPDATE
  SET ultimo_numero = public.sequencia_lote_producao.ultimo_numero + 1
  RETURNING ultimo_numero INTO v_next;

  RETURN v_next;
END;
$$;

COMMENT ON FUNCTION public.reservar_numero_lote_producao(uuid, uuid) IS
  'Reserva o próximo número de lote de produção (1, 2, …) por produto e local (indústria), de forma atômica.';

GRANT EXECUTE ON FUNCTION public.reservar_numero_lote_producao(uuid, uuid) TO anon, authenticated, service_role;

ALTER TABLE public.producoes
  ADD COLUMN IF NOT EXISTS numero_lote_producao INTEGER;

-- Backfill: ordem cronológica por produto + local
WITH ordered AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY produto_id, COALESCE(local_id, '00000000-0000-0000-0000-000000000000'::uuid)
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.producoes
  WHERE numero_lote_producao IS NULL
)
UPDATE public.producoes p
SET numero_lote_producao = o.rn
FROM ordered o
WHERE p.id = o.id;

UPDATE public.producoes
SET numero_lote_producao = 1
WHERE numero_lote_producao IS NULL;

ALTER TABLE public.producoes
  ALTER COLUMN numero_lote_producao SET NOT NULL;

-- Sincroniza contador com histórico (somente linhas com local_id real — FK em locais)
INSERT INTO public.sequencia_lote_producao (produto_id, local_id, ultimo_numero)
SELECT produto_id, local_id, MAX(numero_lote_producao)
FROM public.producoes
WHERE local_id IS NOT NULL
GROUP BY produto_id, local_id
ON CONFLICT (produto_id, local_id) DO UPDATE
SET ultimo_numero = GREATEST(
  public.sequencia_lote_producao.ultimo_numero,
  EXCLUDED.ultimo_numero
);

ALTER TABLE public.itens
  ADD COLUMN IF NOT EXISTS producao_id UUID REFERENCES public.producoes(id) ON DELETE SET NULL;

ALTER TABLE public.itens
  ADD COLUMN IF NOT EXISTS sequencia_no_lote_producao INTEGER;

ALTER TABLE public.etiquetas
  ADD COLUMN IF NOT EXISTS lote_producao_numero INTEGER;

ALTER TABLE public.etiquetas
  ADD COLUMN IF NOT EXISTS sequencia_no_lote_producao INTEGER;

ALTER TABLE public.etiquetas
  ADD COLUMN IF NOT EXISTS data_lote_producao TIMESTAMPTZ;

ALTER TABLE public.etiquetas
  ADD COLUMN IF NOT EXISTS num_baldes_lote_producao INTEGER;

CREATE INDEX IF NOT EXISTS idx_itens_producao_id ON public.itens(producao_id)
  WHERE producao_id IS NOT NULL;
