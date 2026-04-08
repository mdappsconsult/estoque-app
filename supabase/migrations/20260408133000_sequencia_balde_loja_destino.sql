-- Sequência numérica de baldes (indústria → loja) por local de destino, para uso na operação da filial.

ALTER TABLE public.etiquetas
  ADD COLUMN IF NOT EXISTS numero_sequencia_loja integer NULL;

COMMENT ON COLUMN public.etiquetas.numero_sequencia_loja IS
  'Contador por loja de destino para baldes enviados da indústria (Separar por Loja); incrementa entre remessas.';

CREATE TABLE IF NOT EXISTS public.sequencia_balde_loja_destino (
  local_destino_id uuid NOT NULL REFERENCES public.locais(id) ON DELETE CASCADE,
  ultimo_numero bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (local_destino_id)
);

COMMENT ON TABLE public.sequencia_balde_loja_destino IS
  'Último número usado na sequência de baldes por loja (envio indústria → filial).';

ALTER TABLE public.sequencia_balde_loja_destino ENABLE ROW LEVEL SECURITY;

-- Sem políticas: acesso apenas via função SECURITY DEFINER (e service_role no painel).

CREATE OR REPLACE FUNCTION public.reservar_sequencia_balde_loja(
  p_local_destino_id uuid,
  p_quantidade integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_atual bigint;
  v_primeiro integer;
BEGIN
  IF p_local_destino_id IS NULL OR p_quantidade IS NULL OR p_quantidade < 1 THEN
    RAISE EXCEPTION 'reservar_sequencia_balde_loja: parâmetros inválidos';
  END IF;

  INSERT INTO public.sequencia_balde_loja_destino (local_destino_id, ultimo_numero)
  VALUES (p_local_destino_id, 0)
  ON CONFLICT (local_destino_id) DO NOTHING;

  SELECT ultimo_numero INTO v_atual
  FROM public.sequencia_balde_loja_destino
  WHERE local_destino_id = p_local_destino_id
  FOR UPDATE;

  IF v_atual IS NULL THEN
    RAISE EXCEPTION 'reservar_sequencia_balde_loja: contador não encontrado';
  END IF;

  v_primeiro := (v_atual + 1)::integer;

  UPDATE public.sequencia_balde_loja_destino
  SET ultimo_numero = v_atual + p_quantidade::bigint,
      updated_at = now()
  WHERE local_destino_id = p_local_destino_id;

  RETURN v_primeiro;
END;
$fn$;

COMMENT ON FUNCTION public.reservar_sequencia_balde_loja(uuid, integer) IS
  'Reserva p_quantidade números consecutivos; retorna o primeiro (ex.: 6 para lote de 5 após contador em 5).';

REVOKE ALL ON TABLE public.sequencia_balde_loja_destino FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.reservar_sequencia_balde_loja(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_sequencia_balde_loja(uuid, integer) TO service_role;
