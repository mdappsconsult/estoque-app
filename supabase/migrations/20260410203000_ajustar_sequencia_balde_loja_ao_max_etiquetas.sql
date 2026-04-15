-- Alinha `sequencia_balde_loja_destino.ultimo_numero` ao maior `numero_sequencia_loja`
-- já presente em etiquetas vinculadas a remessas indústria → loja para o mesmo destino.
-- Evita recomeçar em 1 quando o contador nunca foi atualizado (ex.: histórico SEP só no upsert antigo).

CREATE OR REPLACE FUNCTION public.ajustar_sequencia_balde_loja_ao_max_etiquetas(p_local_destino_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_max integer;
  v_atual bigint;
BEGIN
  IF p_local_destino_id IS NULL THEN
    RAISE EXCEPTION 'ajustar_sequencia_balde_loja_ao_max_etiquetas: destino inválido';
  END IF;

  SELECT COALESCE(MAX(e.numero_sequencia_loja), 0)::integer INTO v_max
  FROM public.etiquetas e
  INNER JOIN public.transferencia_itens ti ON ti.item_id = e.id
  INNER JOIN public.transferencias t ON t.id = ti.transferencia_id
  WHERE t.destino_id = p_local_destino_id
    AND t.tipo = 'WAREHOUSE_STORE'
    AND e.excluida = false
    AND e.numero_sequencia_loja IS NOT NULL;

  INSERT INTO public.sequencia_balde_loja_destino (local_destino_id, ultimo_numero)
  VALUES (p_local_destino_id, 0)
  ON CONFLICT (local_destino_id) DO NOTHING;

  SELECT ultimo_numero INTO v_atual
  FROM public.sequencia_balde_loja_destino
  WHERE local_destino_id = p_local_destino_id
  FOR UPDATE;

  IF v_atual IS NULL THEN
    RAISE EXCEPTION 'ajustar_sequencia_balde_loja_ao_max_etiquetas: contador não encontrado';
  END IF;

  IF v_max::bigint > v_atual THEN
    UPDATE public.sequencia_balde_loja_destino
    SET ultimo_numero = v_max::bigint,
        updated_at = now()
    WHERE local_destino_id = p_local_destino_id;
  END IF;
END;
$fn$;

COMMENT ON FUNCTION public.ajustar_sequencia_balde_loja_ao_max_etiquetas(uuid) IS
  'Garante ultimo_numero >= maior numero_sequencia_loja já usado em etiquetas da loja (via transferências WAREHOUSE_STORE).';

GRANT EXECUTE ON FUNCTION public.ajustar_sequencia_balde_loja_ao_max_etiquetas(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ajustar_sequencia_balde_loja_ao_max_etiquetas(uuid) TO service_role;
