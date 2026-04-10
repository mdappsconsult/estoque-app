-- Correção pontual: remessa Estoque → Delivery encerrada com DIVERGENCE por recebimento parcial
-- (vários aparelhos na mesma conta). Move faltantes (EM_TRANSFERENCIA no Estoque) para o Delivery
-- como EM_ESTOQUE, marca transferencia_itens.recebido, divergências resolvidas, transferência DELIVERED,
-- recalcula agregado public.estoque por produto afetado.
--
-- Aplicado no projeto alinhado ao MCP / .env.local em 2026-04-09.
-- NÃO reexecutar cegamente: conferir IDs de transferência, origem, destino e contagem de linhas antes.

-- IDs desta operação:
-- transferencia_id = ccff554b-82e3-4200-956f-85af6cd7b346
-- local Estoque      = fdad78f9-dc0c-4b67-bcf0-115ba68a7846
-- local Delivery     = 97cff1c2-6add-4f3a-a7ba-6024d6fd1fb6
-- resolvido_por (Marco) = e89de026-dfb2-4828-b7ca-6bf714f43397

BEGIN;

UPDATE public.transferencia_itens ti
SET recebido = true
WHERE ti.transferencia_id = 'ccff554b-82e3-4200-956f-85af6cd7b346'
  AND ti.item_id IN (
    SELECT d.item_id FROM public.divergencias d
    WHERE d.transferencia_id = 'ccff554b-82e3-4200-956f-85af6cd7b346'
      AND d.tipo = 'FALTANTE' AND d.resolvido = false
  );

UPDATE public.itens i
SET local_atual_id = '97cff1c2-6add-4f3a-a7ba-6024d6fd1fb6',
    estado = 'EM_ESTOQUE'
WHERE i.id IN (
    SELECT d.item_id FROM public.divergencias d
    WHERE d.transferencia_id = 'ccff554b-82e3-4200-956f-85af6cd7b346'
      AND d.tipo = 'FALTANTE' AND d.resolvido = false
  )
  AND i.estado = 'EM_TRANSFERENCIA'
  AND i.local_atual_id = 'fdad78f9-dc0c-4b67-bcf0-115ba68a7846';

UPDATE public.divergencias
SET resolvido = true,
    resolvido_por = 'e89de026-dfb2-4828-b7ca-6bf714f43397'
WHERE transferencia_id = 'ccff554b-82e3-4200-956f-85af6cd7b346'
  AND resolvido = false;

UPDATE public.transferencias
SET status = 'DELIVERED'
WHERE id = 'ccff554b-82e3-4200-956f-85af6cd7b346';

INSERT INTO public.estoque (produto_id, quantidade, updated_at)
SELECT i.produto_id, COUNT(*)::int, now()
FROM public.itens i
WHERE i.estado = 'EM_ESTOQUE'
  AND i.produto_id IN (
    SELECT DISTINCT i2.produto_id
    FROM public.itens i2
    WHERE i2.id IN (
      SELECT d.item_id FROM public.divergencias d
      WHERE d.transferencia_id = 'ccff554b-82e3-4200-956f-85af6cd7b346'
        AND d.tipo = 'FALTANTE'
    )
  )
GROUP BY i.produto_id
ON CONFLICT (produto_id) DO UPDATE
SET quantidade = EXCLUDED.quantidade, updated_at = EXCLUDED.updated_at;

INSERT INTO public.auditoria (usuario_id, local_id, acao, detalhes, destino_id)
VALUES (
  'e89de026-dfb2-4828-b7ca-6bf714f43397',
  '97cff1c2-6add-4f3a-a7ba-6024d6fd1fb6',
  'CORRECAO_DIVERGENCIA_ENTREGUE',
  jsonb_build_object(
    'transferencia_id', 'ccff554b-82e3-4200-956f-85af6cd7b346',
    'origem', 'Estoque',
    'destino', 'Delivery',
    'itens_movidos_faltante', 481,
    'nota', 'Conferência: faltantes tratados como recebidos no Delivery; divergências marcadas resolvidas.'
  ),
  '97cff1c2-6add-4f3a-a7ba-6024d6fd1fb6'
);

COMMIT;
