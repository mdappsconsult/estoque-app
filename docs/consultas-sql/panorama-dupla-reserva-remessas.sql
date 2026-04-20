-- Panorama: mesmo QR (`item_id`) em mais de uma remessa WAREHOUSE_STORE (dupla reserva).
-- Novos INSERTs em `transferencia_itens` com item já em remessa aberta falham no banco após
-- migração `20260420180000_transferencia_itens_bloquear_dup_remessa_aberta.sql` (trigger).
-- Efeitos típicos: etiqueta com destino A; `itens.local_atual` após recebimentos = destino do
-- último recebimento que incluiu o QR; possível divergência com a prateleira física.
--
-- Blindagem no app (criarTransferencia): item já em remessa aberta não entra em outra.
-- Números abaixo recalculam no SQL Editor a qualquer momento.

-- A) Total de itens com 2+ transferências (qualquer tipo)
WITH dup AS (
  SELECT ti.item_id
  FROM public.transferencia_itens ti
  GROUP BY ti.item_id
  HAVING COUNT(DISTINCT ti.transferencia_id) > 1
)
SELECT COUNT(*) AS itens_multiplas_remessas_total FROM dup;

-- B) Entre os de (A), distribuição por estado do item hoje
WITH dup AS (
  SELECT ti.item_id
  FROM public.transferencia_itens ti
  GROUP BY ti.item_id
  HAVING COUNT(DISTINCT ti.transferencia_id) > 1
)
SELECT i.estado, COUNT(*) AS qtd
FROM dup
JOIN public.itens i ON i.id = dup.item_id
GROUP BY i.estado
ORDER BY qtd DESC;

-- C) Mesmo dia (America/Sao_Paulo), mesma origem, dois destinos diferentes (assinatura dupla lista)
WITH trs AS (
  SELECT ti.item_id,
         tr.id AS tid,
         tr.destino_id,
         (tr.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
         tr.origem_id
  FROM public.transferencia_itens ti
  JOIN public.transferencias tr ON tr.id = ti.transferencia_id AND tr.tipo = 'WAREHOUSE_STORE'
)
SELECT COUNT(DISTINCT a.item_id) AS itens_mesmo_dia_origem_dois_destinos
FROM trs a
JOIN trs b
  ON b.item_id = a.item_id
 AND b.dia = a.dia
 AND b.origem_id = a.origem_id
 AND b.tid <> a.tid
 AND b.destino_id <> a.destino_id;

-- D) Pares de lojas mais afetados (dia + origem + par ordenado)
WITH trs AS (
  SELECT ti.item_id,
         tr.id AS tid,
         tr.destino_id,
         d.nome AS destino,
         (tr.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
         tr.origem_id,
         o.nome AS origem
  FROM public.transferencia_itens ti
  JOIN public.transferencias tr ON tr.id = ti.transferencia_id AND tr.tipo = 'WAREHOUSE_STORE'
  JOIN public.locais d ON d.id = tr.destino_id
  JOIN public.locais o ON o.id = tr.origem_id
)
SELECT a.dia,
       a.origem,
       LEAST(a.destino, b.destino) AS loja_a,
       GREATEST(a.destino, b.destino) AS loja_b,
       COUNT(DISTINCT a.item_id) AS itens
FROM trs a
JOIN trs b
  ON b.item_id = a.item_id
 AND b.dia = a.dia
 AND b.origem_id = a.origem_id
 AND b.tid <> a.tid
 AND b.destino_id <> a.destino_id
GROUP BY a.dia, a.origem, LEAST(a.destino, b.destino), GREATEST(a.destino, b.destino)
ORDER BY itens DESC, a.dia DESC
LIMIT 40;
