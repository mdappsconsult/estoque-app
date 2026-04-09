#!/usr/bin/env bash
# Duplica uma fila CUPS existente (mesmo URI USB) com novo nome — típico: ZebraZD220 → ZebraZD220-6060.
# Depois defina mídia 60×60 em http://127.0.0.1:631 → nova fila → Set Default Options.
set -euo pipefail

SOURCE="${1:-ZebraZD220}"
TARGET="${2:-ZebraZD220-6060}"

if ! lpstat -p "$SOURCE" &>/dev/null; then
  echo "Fila origem '$SOURCE' não encontrada. Filas:" >&2
  lpstat -p 2>/dev/null || true
  exit 1
fi

if lpstat -p "$TARGET" &>/dev/null; then
  echo "Fila '$TARGET' já existe." >&2
  exit 0
fi

line=$(lpstat -v "$SOURCE" 2>/dev/null | head -1)
URI=${line#*device for ${SOURCE}: }
if [[ -z "$URI" || "$URI" == "$line" ]]; then
  echo "Não consegui ler o URI de '$SOURCE'. Saída:" >&2
  echo "$line" >&2
  exit 1
fi

echo "Origem: $SOURCE"
echo "URI:    $URI"
echo "Criando fila: $TARGET (driver zebra.ppd igual à origem)"
sudo lpadmin -p "$TARGET" -E -v "$URI" -m drv:///sample.drv/zebra.ppd

echo ""
echo "Próximo passo: http://127.0.0.1:631 → Printers → $TARGET → Set Default Options → mídia 60×60 mm."
echo "Conferir opções: lpoptions -p $TARGET -l | grep -iE 'page|media|label'"
echo "No .env do Pi: CUPS_QUEUE=$TARGET"
echo "Doc: docs/CUPS_ZEBRA_60X60.md"
