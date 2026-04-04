# Impressão Pi / Zebra a partir de qualquer lugar

O Raspberry fica na **rede local** (`192.168.x.x`). Nenhum computador na internet consegue abrir `ws://192.168.1.159:8765` diretamente: falta rota pública e, em páginas **HTTPS**, o navegador bloqueia **ws://** (conteúdo misto).

## O que fazer na prática

1. **Túnel** da internet até o serviço `pi-print-ws` no Pi (mesma máquina onde roda a porta **8765**).
2. Guardar no **Supabase** a URL pública **`wss://…`** (e token, se usar) na tabela **`config_impressao_pi`**.
3. **Não** é obrigatório `NEXT_PUBLIC_PI_PRINT_WS_URL` no `.env` de cada PC ou no Railway: o app lê o Supabase depois do login (anon key + política atual do projeto).

### Ordem no app

1. Variável `NEXT_PUBLIC_PI_PRINT_WS_URL` (se existir) — prioridade, útil no **dev local**.
2. Senão, linha `id = 1` em **`config_impressao_pi`**.

## Dois “tokens” diferentes (para não confundir)

1. **`PRINT_WS_TOKEN` (no Pi, coluna `ws_token` no Supabase)**  
   É a **senha da ponte de impressão**: o app envia esse valor ao conectar no WebSocket do Pi. Quem tiver o mesmo valor pode mandar trabalhos de impressão. Evite colar esse valor em chat público ou commit. Mantém-se **igual** no `.env` do Pi e em `config_impressao_pi.ws_token`.

2. **`tunnel_sync_secret` / `PI_TUNNEL_SYNC_SECRET`**  
   Segredo **só para o Pi** chamar a RPC que atualiza **`ws_public_url`** quando o hostname do túnel **quick** muda. Não substitui o `PRINT_WS_TOKEN`. Copie de `SELECT tunnel_sync_secret …` (SQL Editor) para o `.env` do Pi.

## Cloudflare Tunnel **quick** com sincronização automática no Supabase

Cada reinício do `cloudflared` quick pode gerar outro **`*.trycloudflare.com`**. Com as migrações `20260405100000_sync_pi_tunnel_ws_url_rpc.sql` e `20260405100001_config_impressao_pi_column_privileges_tunnel_secret.sql`:

- O Pi executa `cloudflared-quick-tunnel-sync.sh` (em `scripts/pi-print-ws/` no repositório).
- Ao ver nos logs uma URL `https://….trycloudflare.com`, o script chama **`sync_pi_tunnel_ws_url`** (anon + `PI_TUNNEL_SYNC_SECRET`) e o banco grava **`wss://…`** em `ws_public_url`.

**No Raspberry:** copie o script para `~/pi-print-ws/`, use a unit `cloudflared-pi-print-ws.service` e no `.env` inclua `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `PI_TUNNEL_SYNC_SECRET` (e o restante do bridge). Detalhe: `docs/consultas-sql/config-impressao-pi.sql`.

## Exemplo manual (só `cloudflared`, sem script)

```bash
cloudflared tunnel --url http://127.0.0.1:8765
```

Depois ajuste **`ws_public_url`** no Supabase (`wss://….trycloudflare.com`).

```sql
UPDATE public.config_impressao_pi
SET
  ws_public_url = 'wss://SEU-SUBDOMINIO.trycloudflare.com',
  ws_token = 'MESMO_TOKEN_DO_PRINT_WS_TOKEN_NO_PI',
  cups_queue = 'ZebraZD220',
  updated_at = now()
WHERE id = 1;
```

## Túnel **nomeado** (Cloudflare Zero Trust)

Hostname **fixo**: não depende de sincronizar a cada reinício do quick tunnel. Configure no painel e defina `ws_public_url` uma vez.

## Outras opções

- **Tailscale / ZeroTier**: VPN entre o celular/PC e a rede da fábrica; aí você pode usar IP Tailscale com `wss` só se terminar TLS no Pi ou no proxy.
- **ngrok** `http` com suporte a WebSocket: URL `wss://` fornecida pelo painel.

## Segurança

- URL pública + **`ws_token`** expõe a fila de impressão na internet: use **token forte** (`PRINT_WS_TOKEN`) e o **mesmo** em `config_impressao_pi.ws_token`.
- **`tunnel_sync_secret`**: só o Pi (e quem tem acesso ao SQL com service role) deve conhecer; a API anon **não** expõe essa coluna nas leituras normais da tabela (privilégios por coluna).
- A política RLS da tabela segue o padrão do projeto (`USING (true)`); a RPC de sync valida o segredo antes de alterar `ws_public_url`.

## Migração

Aplicar no Supabase, nesta ordem:

- `supabase/migrations/20260404140000_config_impressao_pi.sql`
- `supabase/migrations/20260405100000_sync_pi_tunnel_ws_url_rpc.sql`
- `supabase/migrations/20260405100001_config_impressao_pi_column_privileges_tunnel_secret.sql`

Consulta de apoio: `docs/consultas-sql/config-impressao-pi.sql`.
