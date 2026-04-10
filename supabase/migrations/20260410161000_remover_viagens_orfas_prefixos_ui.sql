-- Remoção pontual: viagens órfãs (sem transferências) cujo UUID começa com os prefixos
-- exibidos na tela «Viagem · código XXXXXXXX» (primeiros 8 hex do id).
-- Seguro: só apaga se NOT EXISTS remessa; marca etiquetas SEP-{uuid} excluídas.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT v.id
    FROM public.viagens v
    WHERE NOT EXISTS (SELECT 1 FROM public.transferencias t WHERE t.viagem_id = v.id)
      AND upper(substring(v.id::text, 1, 8)) IN (
        '4FC3B3A7',
        '9BD26EB9',
        'F623CF69'
      )
  LOOP
    UPDATE public.etiquetas
    SET excluida = true
    WHERE lote = 'SEP-' || r.id::text
      AND excluida IS NOT TRUE;

    DELETE FROM public.viagens WHERE id = r.id;
  END LOOP;
END $$;
