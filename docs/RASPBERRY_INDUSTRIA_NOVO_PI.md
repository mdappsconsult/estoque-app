# Novo Raspberry Pi na indústria — ponte de impressão (`papel = industria`)

Este guia é o roteiro **fechado** para montar o **segundo** Raspberry na indústria: mesmo software `pi-print-ws` + túnel Cloudflare, mas no Supabase a linha é **`config_impressao_pi.papel = 'industria'`** (não misturar com **estoque**).

Leia também: `docs/IMPRESSAO_PI_ACESSO_REMOTO.md` (conceitos wss, tokens, segurança).

---

## 1. O que já deve existir no projeto (antes de ligar o Pi)

- Migração **`20260406120000_config_impressao_pi_papel.sql`** aplicada no Supabase (duas linhas: `estoque` e `industria`).
- No app: **Configurações → Impressoras (Pi)** — seção **Ponte indústria** para conferir URL/token/fila e **Verificar agora**.

---

## 2. Informações para “passar” quando não há SSH da sua parte

Quem for **terminar o setup à distância** (outra pessoa, ou você depois) precisa de **um** destes caminhos:

| Cenário | O que você envia / habilita |
|--------|-----------------------------|
| **SSH depois** | IP **local** do Pi na Wi‑Fi da indústria (ex.: `192.168.x.x`), **usuário Linux**, **senha** ou **chave pública** já instalada em `~/.ssh/authorized_keys`, confirmação de que o Pi está na rede. |
| **Tailscale / VPN** | Nome Tailscale do Pi ou IP Tailscale (acesso remoto sem abrir porta no roteador). |
| **Só presencial** | Nada remoto: alguém na fábrica segue **a partir da secção 5** neste documento, com teclado/monitor ou notebook na mesma rede. |

**Sem SSH e sem VPN:** não dá para “fazer o resto” remotamente de forma segura e repetível; o máximo é alguém **no local** executar os comandos abaixo (ou gravar um vídeo da tela seguindo o checklist).

**Dados do Supabase (não colar em chat público):** para a linha **`industria`**, obter no SQL Editor (ver `docs/consultas-sql/config-impressao-pi.sql`):

- `tunnel_sync_secret` → vai no Pi como **`PI_TUNNEL_SYNC_SECRET`**
- Definir um **`PRINT_WS_TOKEN`** forte e gravar o **mesmo** valor em **`ws_token`** dessa linha (tela **Impressoras** ou `UPDATE`).

**Variável que diferencia o Pi de estoque do de indústria:**

```bash
PI_TUNNEL_PAPEL=industria
```

Sem isso, o script de sync atualiza a linha **estoque** por engano.

---

## 3. Checklist físico na indústria

- [ ] Raspberry com alimentação estável; cartão SD ou SSD OK.
- [ ] Sistema recomendado: **Raspberry Pi OS Lite** (64-bit) ou Desktop, atualizado (`sudo apt update && sudo apt full-upgrade -y`).
- [ ] **Wi‑Fi** da indústria configurada no Pi (ou cabo Ethernet).
- [ ] Impressora térmica:
  - **USB no Pi** (igual ao primeiro setup), ou
  - **Rede (Wi‑Fi/Ethernet)** — ajustar fila CUPS no Pi para `socket://IP:9100` ou `ipp://…` (fora do escopo mínimo deste guia, mas o app continua igual: jobs saem pelo `lp` no Pi).
- [ ] Mesma rede permite o Pi sair à **internet** (túnel Cloudflare).

---

## 4. Pacotes no Raspberry (resumo)

Ajuste **`USUARIO_PI`** (ex.: `kim` ou outro login Linux que você criar). Pastas usadas: **`/home/USUARIO_PI/pi-print-ws`**.

```bash
sudo apt install -y nodejs npm chromium cups cloudflared
# Se node do apt for antigo, use Node 20+ (Nodesource ou nvm) conforme ambiente.
sudo usermod -aG lpadmin USUARIO_PI
```

Instalar fila CUPS (exemplo USB Zebra — nomes variam):

```bash
sudo lpadmin -p ZebraZD220 -E -v "usb://..." -m drv:///sample.drv/zebra.ppd
# ou use a interface web CUPS: http://IP-DO-PI:631
```

Teste local no Pi:

```bash
curl -sS http://127.0.0.1:8765/health
# esperado: texto contendo "pi-print-ws"
```

(só depois de subir o `pi-print-ws`; ver próximo bloco)

---

## 5. Instalar `pi-print-ws` e túnel (igual ao Pi de estoque, `.env` diferente)

1. No repositório **estoque-app**, pasta **`scripts/pi-print-ws/`**:
   - `server.mjs`
   - `package.json`
   - `cloudflared-quick-tunnel-sync.sh` (já envia `p_papel` se `PI_TUNNEL_PAPEL` estiver definido)
   - `pi-print-ws.service`
   - `cloudflared-pi-print-ws.service`

2. No Pi:

```bash
mkdir -p /home/USUARIO_PI/pi-print-ws
# copiar os ficheiros acima (scp, git clone, pen drive, etc.)
cd /home/USUARIO_PI/pi-print-ws
npm ci
chmod +x cloudflared-quick-tunnel-sync.sh
```

3. Criar **`/home/USUARIO_PI/pi-print-ws/.env`** (valores reais, **não** commitar):

```env
# Obrigatório para o bridge
PRINT_WS_TOKEN=cole_o_mesmo_ws_token_da_linha_industria_no_Supabase
CUPS_QUEUE=ZebraZD220

# Sincronizar URL do túnel quick → Supabase (linha industria)
SUPABASE_URL=https://SEU_PROJETO.supabase.co
SUPABASE_ANON_KEY=sua_anon_key
PI_TUNNEL_SYNC_SECRET=cole_tunnel_sync_secret_da_linha_industria
PI_TUNNEL_PAPEL=industria
```

4. Ajustar **systemd** — os ficheiros versionados usam usuário **`kim`** e caminho **`/home/kim/pi-print-ws`**. Para outro usuário, edite antes de instalar:

```bash
sudo cp pi-print-ws.service cloudflared-pi-print-ws.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pi-print-ws.service
sudo systemctl enable --now cloudflared-pi-print-ws.service
```

5. Logs:

```bash
journalctl -u pi-print-ws -f
journalctl -u cloudflared-pi-print-ws -f
```

6. No **Supabase**, conferir se **`ws_public_url`** da linha **`industria`** virou **`wss://…`** (sync automático no quick tunnel). Na tela **Impressoras**, botão **Verificar agora** na ponte indústria.

7. **Token de impressão:** em **Configurações → Impressoras**, na ponte **indústria**, o campo **token** deve ser **idêntico** a `PRINT_WS_TOKEN` do `.env` do Pi.

---

## 6. Validar do celular / PC (app em produção)

- Abrir **`/teste-impressao-etiqueta?papel=industria`** (perfil com acesso).
- **Imprimir na estação (Pi / Zebra)** — deve sair na impressora da indústria.
- Quando **Produção** passar a usar o Pi no código, usará esta mesma ponte (`industria`); até lá, o teste com query acima basta.

---

## 7. Problemas frequentes

| Sintoma | Verificar |
|--------|-----------|
| App diz que não conecta no WebSocket | `ws_public_url` na linha **industria**, túnel ativo, token na URL igual ao Pi. |
| Sync não atualiza o Supabase | `PI_TUNNEL_SYNC_SECRET` é o da linha **industria**; `PI_TUNNEL_PAPEL=industria`; anon key correta. |
| Impressão falha no `lp` | `CUPS_QUEUE` = nome exato da fila (`lpstat -p`). |
| HTTPS no app + `ws://` local | Em produção use sempre **`wss://`** (túnel); `ws://` só em LAN/http local. |
| Dois Pis gravam na mesma linha | Um Pi **sem** `PI_TUNNEL_PAPEL` (estoque) e outro **com** `PI_TUNNEL_PAPEL=industria`. |

---

## 8. Referência rápida de ficheiros no repo

| Ficheiro | Função |
|----------|--------|
| `scripts/pi-print-ws/server.mjs` | Servidor WS + health |
| `scripts/pi-print-ws/cloudflared-quick-tunnel-sync.sh` | Quick tunnel + RPC `sync_pi_tunnel_ws_url` |
| `supabase/migrations/20260406120000_config_impressao_pi_papel.sql` | Modelo `papel` + RPC |
| `docs/consultas-sql/config-impressao-pi.sql` | SELECT por `papel` e segredos |

---

*Última revisão alinhada ao estoque-app: duas pontes (`estoque` / `industria`), sync com `PI_TUNNEL_PAPEL`.*
