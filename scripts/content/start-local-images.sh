#!/usr/bin/env bash
# Startet ComfyUI unter Linux nur auf 127.0.0.1:8188 — Gegenstück zu
# start-local-images.ps1. Einrichtung: scripts/content/setup-local-images.sh
set -euo pipefail
DIR="$(cd "$(dirname "$0")/../.." && pwd)/_Local/comfy"
if [ ! -x "$DIR/venv/bin/python" ] || [ ! -f "$DIR/ComfyUI/main.py" ]; then
  echo "ComfyUI fehlt. Einrichtung: bash scripts/content/setup-local-images.sh" >&2
  exit 1
fi
exec "$DIR/venv/bin/python" -s "$DIR/ComfyUI/main.py" --listen 127.0.0.1 --port 8188 --disable-auto-launch --lowvram
