#!/usr/bin/env bash
# Roda cloudflared (quick tunnel) e, ao detectar a URL *.trycloudflare.com nos logs,
# chama a RPC sync_pi_tunnel_ws_url no Supabase (anon + PI_TUNNEL_SYNC_SECRET no .env).
#
# Isto atualiza o Supabase SEM colar URL manualmente no app. O hostname quick MUDA a cada
# reinício do cloudflared (limitação da Cloudflare). Para URL fixa, use túnel nomeado:
# docs/TUNEL_PERMANENTE_PRINT_PI.md
set -uo pipefail

ENV_FILE="${PI_PRINT_WS_ENV:-${HOME}/pi-print-ws/.env}"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
fi

# Cópias locais: cloudflared herda o ambiente e pode logar variáveis (não passar segredos ao processo do túnel).
_SB_URL="${SUPABASE_URL:-}"
_SB_KEY="${SUPABASE_ANON_KEY:-}"
_TUNNEL_SYNC_SECRET="${PI_TUNNEL_SYNC_SECRET:-}"
unset SUPABASE_URL SUPABASE_ANON_KEY PI_TUNNEL_SYNC_SECRET

STATE_FILE="${PI_TUNNEL_SYNC_STATE:-${HOME}/.cache/pi-tunnel-last-url}"
TUNNEL_URL="${PI_TUNNEL_TARGET:-http://127.0.0.1:8765}"
# Retentativas ao Supabase (rede instável, cold start, etc.)
SYNC_MAX_ATTEMPTS="${PI_TUNNEL_SYNC_RETRIES:-5}"

sync_url_to_supabase() {
  local https_url="$1"
  if [[ -z "${_SB_URL}" || -z "${_SB_KEY}" || -z "${_TUNNEL_SYNC_SECRET}" ]]; then
    logger -t pi-tunnel-sync "sync ignorado: falta SUPABASE_URL, SUPABASE_ANON_KEY ou PI_TUNNEL_SYNC_SECRET no ${ENV_FILE:-.env}"
    return 0
  fi

  mkdir -p "$(dirname "$STATE_FILE")"
  if [[ -f "$STATE_FILE" ]] && grep -qFx "$https_url" "$STATE_FILE" 2>/dev/null; then
    return 0
  fi

  local body code out attempt
  _PAPEL="${PI_TUNNEL_PAPEL:-estoque}"

  body="$(
    HTTPS_URL="$https_url" PI_TUNNEL_SYNC_SECRET="$_TUNNEL_SYNC_SECRET" PI_TUNNEL_PAPEL="$_PAPEL" python3 <<'PY'
import json, os
print(json.dumps({
  "p_sync_secret": os.environ["PI_TUNNEL_SYNC_SECRET"],
  "p_https_url": os.environ["HTTPS_URL"],
  "p_papel": os.environ.get("PI_TUNNEL_PAPEL") or "estoque",
}))
PY
  )" || return 0

  for attempt in $(seq 1 "$SYNC_MAX_ATTEMPTS"); do
    out=$(mktemp)
    code=$(curl -sS -o "$out" -w "%{http_code}" -X POST "${_SB_URL}/rest/v1/rpc/sync_pi_tunnel_ws_url" \
      -H "apikey: ${_SB_KEY}" \
      -H "Authorization: Bearer ${_SB_KEY}" \
      -H "Content-Type: application/json" \
      -H "Prefer: return=minimal" \
      -d "$body") || code="curl_err"

    if [[ "$code" == "204" ]]; then
      printf '%s\n' "$https_url" >"$STATE_FILE"
      logger -t pi-tunnel-sync "ws_public_url sincronizado no Supabase (tentativa ${attempt}/${SYNC_MAX_ATTEMPTS})"
      rm -f "$out"
      return 0
    fi

    logger -t pi-tunnel-sync "sync tentativa ${attempt}/${SYNC_MAX_ATTEMPTS} falhou HTTP ${code}: $(head -c 400 "$out" 2>/dev/null | tr '\n' ' ')"
    rm -f "$out"
    if [[ "$attempt" -lt "$SYNC_MAX_ATTEMPTS" ]]; then
      sleep "$((attempt * 2))"
    fi
  done

  logger -t pi-tunnel-sync "sync esgotou retentativas para ${https_url} — verifique segredo, rede e RPC sync_pi_tunnel_ws_url"
  return 1
}

stdbuf -oL -eL /usr/bin/cloudflared --no-autoupdate tunnel --url "$TUNNEL_URL" 2>&1 | while IFS= read -r line; do
  printf '%s\n' "$line"
  # Captura qualquer https://*.trycloudflare.com na linha (formatos variam entre versões do cloudflared)
  https_url=$(printf '%s' "$line" | grep -oE 'https://[a-zA-Z0-9][a-zA-Z0-9.-]*\.trycloudflare\.com' | head -n1)
  if [[ -n "${https_url:-}" ]]; then
    sync_url_to_supabase "$https_url" || true
  fi
done
