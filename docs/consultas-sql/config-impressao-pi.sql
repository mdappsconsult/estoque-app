-- Ponte de impressão Raspberry (WebSocket público via túnel).
-- Migrações: 20260404140000, 20260405100000, 20260405100001, 20260406120000 (papel).

SELECT id, papel, ws_public_url,
       CASE WHEN length(trim(ws_token)) > 0 THEN '[definido]' ELSE '' END AS token_definido,
       cups_queue, updated_at
FROM public.config_impressao_pi
ORDER BY papel;

-- Segredo para o Pi sincronizar ws_public_url (RPC sync_pi_tunnel_ws_url). Copiar para PI_TUNNEL_SYNC_SECRET no .env do Pi.
-- Cada Raspberry usa o segredo da linha do seu papel (estoque vs industria). Anon não lê esta coluna via API.
SELECT papel, tunnel_sync_secret
FROM public.config_impressao_pi
ORDER BY papel;

-- Exemplo de atualização manual (substitua valores):
-- UPDATE public.config_impressao_pi
-- SET ws_public_url = 'wss://seu-tunnel.example.com',
--     ws_token = 'token-igual-ao-.env-do-pi',
--     cups_queue = 'ZebraZD220',
--     updated_at = now()
-- WHERE papel = 'estoque';
