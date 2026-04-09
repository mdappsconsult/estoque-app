-- Evita a mesma unidade (item) vinculada duas vezes à mesma transferência — gerava contagem «10 unidades»
-- no painel com só 5 linhas em `etiquetas` (PK = item_id).

DELETE FROM public.transferencia_itens a
USING public.transferencia_itens b
WHERE a.transferencia_id = b.transferencia_id
  AND a.item_id = b.item_id
  AND a.ctid > b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS transferencia_itens_transferencia_item_uidx
  ON public.transferencia_itens (transferencia_id, item_id);
