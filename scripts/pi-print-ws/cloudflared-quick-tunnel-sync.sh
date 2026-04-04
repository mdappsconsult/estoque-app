#!/usr/bin/env bash
# Roda cloudflared (quick tunnel) e, ao detectar a URL *.trycloudflare.com nos logs,
# chama a RPC sync_pi_tunnel_ws_url no Supabase (anon + PI_TUNNEL_SYNC_SECRET no .env).
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

sync_url_to_supabase() {
  local https_url="$1"
  if [[ -z "${_SB_URL}" || -z "${_SB_KEY}" || -z "${_TUNNEL_SYNC_SECRET}" ]]; then
    return 0
  fi

  mkdir -p "$(dirname "$STATE_FILE")"
  if [[ -f "$STATE_FILE" ]] && grep -qFx "$https_url" "$STATE_FILE" 2>/dev/null; then
    return 0
  fi

  local body code out
  # PI_TUNNEL_PAPEL=industria no .env do segundo Raspberry (padrão: estoque).
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

  out=$(mktemp)
  code=$(curl -sS -o "$out" -w "%{http_code}" -X POST "${_SB_URL}/rest/v1/rpc/sync_pi_tunnel_ws_url" \
    -H "apikey: ${_SB_KEY}" \
    -H "Authorization: Bearer ${_SB_KEY}" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    -d "$body") || true

  if [[ "$code" == "204" ]]; then
    printf '%s\n' "$https_url" >"$STATE_FILE"
    logger -t pi-tunnel-sync "ws_public_url sincronizado no Supabase"
  else
    logger -t pi-tunnel-sync "sync falhou HTTP ${code}: $(head -c 300 "$out" 2>/dev/null)"
  fi
  rm -f "$out"
}

stdbuf -oL -eL /usr/bin/cloudflared --no-autoupdate tunnel --url "$TUNNEL_URL" 2>&1 | while IFS= read -r line; do
  printf '%s\n' "$line"
  if [[ "$line" =~ https://[a-zA-Z0-9.-]+\.trycloudflare\.com ]]; then
    sync_url_to_supabase "${BASH_REMATCH[0]}" || true
  fi
done
