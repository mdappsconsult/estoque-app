-- Ponte de impressão Raspberry (WebSocket público via túnel).
-- Aplicar migração 20260404140000_config_impressao_pi.sql antes.

SELECT id, ws_public_url,
       CASE WHEN length(trim(ws_token)) > 0 THEN '[definido]' ELSE '' END AS token_definido,
       cups_queue, updated_at
FROM public.config_impressao_pi
WHERE id = 1;

-- Segredo para o Pi sincronizar ws_public_url (RPC sync_pi_tunnel_ws_url). Copiar para PI_TUNNEL_SYNC_SECRET no .env do Pi.
-- Só no SQL Editor / role com leitura na coluna (anon não vê esta coluna via API).
SELECT tunnel_sync_secret
FROM public.config_impressao_pi
WHERE id = 1;

-- Exemplo de atualização (substitua valores):
-- UPDATE public.config_impressao_pi
-- SET ws_public_url = 'wss://seu-tunnel.example.com',
--     ws_token = 'token-igual-ao-.env-do-pi',
--     cups_queue = 'ZebraZD220',
--     updated_at = now()
-- WHERE id = 1;
