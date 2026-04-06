# Túnel permanente para impressão Pi / Zebra (URL que não muda)

## Por que o quick tunnel (`*.trycloudflare.com`) incomoda

O comando `cloudflared tunnel --url http://127.0.0.1:8765` (túnel **quick**) gera um hostname **novo e aleatório** sempre que o processo sobe. Não existe como a Cloudflare manter o mesmo nome nesse modo.

O projeto já tem **sincronização automática** (`cloudflared-quick-tunnel-sync.sh` + RPC `sync_pi_tunnel_ws_url`): quando o Pi recebe a URL nova nos logs, o Supabase é atualizado **sem colar manualmente** no painel — desde que o script rode com `PI_TUNNEL_SYNC_SECRET` correto e a rede permita o `curl` ao Supabase. Ainda assim, entre reinícios pode haver um intervalo curto em que o app aponta para o host antigo (`ENOTFOUND`).

Para **não depender de hostname que muda**, use um **túnel nomeado** (Cloudflare Zero Trust) com **hostname fixo**.

---

## Recomendado em produção: túnel nomeado Cloudflare

Você passa a ter algo como `wss://print.suaempresa.com.br` ou `wss://algo.cfargotunnel.com` que **só muda se você alterar no painel**.

### Resumo dos passos

1. Conta Cloudflare (pode ser plano gratuito).
2. **Zero Trust** → **Networks** → **Tunnels** → **Create tunnel**.
3. Escolha **Cloudflared**, dê um nome ao túnel, instale o conector no Raspberry (ou copie o comando com token).
4. Em **Public Hostname**, mapeie:
   - **Subdomain** (ex.: `print`) + **Domain** (domínio que você controla na Cloudflare), **Service** `http://127.0.0.1:8765`, tipo HTTP.
   - Ou use o hostname que a própria Cloudflare oferece no fluxo do túnel nomeado.
5. No DNS da zona (Cloudflare), o painel costuma criar o registro **CNAME** automaticamente para o túnel.
6. No Supabase, **`config_impressao_pi.ws_public_url`** = `wss://print.suaempresa.com.br` (sem path, ou só o host que o Cloudflare mostrar) — **uma vez**; não precisa script de sync para mudança de URL do quick.
7. No Pi, em vez do script quick, rode **`cloudflared tunnel run`** com o arquivo de **credenciais** e **config** (exemplo no repositório: `scripts/pi-print-ws/cloudflared-config-named-tunnel.example.yml`).

Documentação oficial (referência): [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/).

### Arquivos de exemplo no repo

- `scripts/pi-print-ws/cloudflared-config-named-tunnel.example.yml` — ingress fixo → `127.0.0.1:8765`.
- `scripts/pi-print-ws/cloudflared-named-tunnel.service.example` — systemd para `tunnel run`.

Ajuste usuário/caminhos (`kim`, `/home/kim/...`) ao seu Pi.

---

## Modo quick + sync (sem colar URL no app)

Se quiser continuar no quick:

- Mantenha a unit **`cloudflared-pi-print-ws.service`** com **`Restart=always`** (já no exemplo do repo).
- No `.env` do Pi: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `PI_TUNNEL_SYNC_SECRET` (igual a `tunnel_sync_secret` da linha do **`papel`** no banco).
- O script foi endurecido com **retentativas** na RPC; se ainda falhar, veja `journalctl -t pi-tunnel-sync`.

Mesmo assim, o hostname **muda** a cada novo quick URL — só o **banco** é atualizado sozinho, não o DNS “antigo” que o app ainda pode usar por segundos/minutos até o próximo deploy/cache.

---

## Checklist rápido

| Objetivo | Caminho |
|----------|---------|
| URL **fixa**, mínima intervenção | Túnel **nomeado** + `ws_public_url` uma vez no Supabase |
| Sem painel Cloudflare “full” | Quick + **sync no Pi** (automático no banco; hostname ainda rotaciona por design Cloudflare) |

Mais contexto: `docs/IMPRESSAO_PI_ACESSO_REMOTO.md`.
