-- Diagnóstico: um mesmo item (QR) vinculado a mais de uma transferência.
-- Causa típica de etiqueta com nome de loja A e `itens.local_atual` na loja B:
-- duas remessas criadas no mesmo intervalo (antes do despacho) com o mesmo `item_id`;
-- impressão 60×30 usa o destino da separação corrente; o último RECEBER_TRANSFERENCIA define `local_atual_id`.
--
-- Uso: substituir o token abaixo.

select
  i.id as item_id,
  i.token_qr,
  i.estado,
  i.local_atual_id,
  l.nome as local_atual,
  ti.transferencia_id,
  tr.status as remessa_status,
  d.nome as destino_remessa,
  tr.created_at as remessa_criada_em,
  ti.recebido
from public.itens i
join public.transferencia_itens ti on ti.item_id = i.id
join public.transferencias tr on tr.id = ti.transferencia_id
join public.locais d on d.id = tr.destino_id
left join public.locais l on l.id = i.local_atual_id
where i.token_qr = 'QR-MN9D7HCO-B7CVQV'
order by tr.created_at;
