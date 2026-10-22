#!/usr/bin/env bash
# Richtet ComfyUI mit FLUX.2 klein 4B (FP8) unter Linux ein — Gegenstück zur
# Windows-Anleitung in docs/lokale-bilder.md. Alles landet in _Local/comfy/
# (gitignored). Mehrfach aufrufbar: Fertiges wird übersprungen, abgebrochene
# Downloads setzen fort.
#
#   bash scripts/content/setup-local-images.sh
#
# Quellen: ComfyUI von GitHub (comfyanonymous/ComfyUI), PyTorch mit CUDA vom
# offiziellen PyTorch-Index, Modelle aus den Links der offiziellen
# ComfyUI-Anleitung (docs.comfy.org/tutorials/flux/flux-2-klein), Lizenz des
# Bildmodells Apache 2.0. Platzbedarf etwa 16 GB.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/_Local/comfy"
mkdir -p "$DIR"
cd "$DIR"

echo "== ComfyUI"
if [ ! -d ComfyUI/.git ]; then
  git clone --depth 1 https://github.com/comfyanonymous/ComfyUI.git
fi

echo "== Python-Umgebung"
if [ ! -x venv/bin/python ]; then
  # Ohne pip anlegen: Linux Mint bringt ensurepip nicht mit (python3-venv fehlt).
  python3 -m venv --without-pip venv
fi
if [ ! -x venv/bin/pip ]; then
  curl -sSL --fail https://bootstrap.pypa.io/get-pip.py -o get-pip.py
  venv/bin/python get-pip.py --quiet
  rm -f get-pip.py
fi
venv/bin/pip install --quiet --upgrade pip
venv/bin/pip install --quiet torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128
venv/bin/pip install --quiet -r ComfyUI/requirements.txt

echo "== Modelle"
lade() {
  local url="$1" ziel="$2" groesse="$3"
  mkdir -p "$(dirname "$ziel")"
  if [ -f "$ziel" ] && [ "$(stat -c %s "$ziel")" = "$groesse" ]; then
    echo "vorhanden: $ziel"
    return
  fi
  curl -L --fail --retry 5 -C - -o "$ziel.part" "$url"
  [ "$(stat -c %s "$ziel.part")" = "$groesse" ] || { echo "Größe stimmt nicht: $ziel"; exit 1; }
  mv "$ziel.part" "$ziel"
}
M=ComfyUI/models
lade https://huggingface.co/black-forest-labs/FLUX.2-klein-4b-fp8/resolve/main/flux-2-klein-4b-fp8.safetensors \
  "$M/diffusion_models/flux-2-klein-4b-fp8.safetensors" 4070624520
lade https://huggingface.co/Comfy-Org/flux2-klein-4B/resolve/main/split_files/text_encoders/qwen_3_4b.safetensors \
  "$M/text_encoders/qwen_3_4b.safetensors" 8044982048
lade https://huggingface.co/Comfy-Org/flux2-dev/resolve/main/split_files/vae/flux2-vae.safetensors \
  "$M/vae/flux2-vae.safetensors" 336213556

echo "== Prüfsumme Bildmodell"
echo "97ed34fe0567e436200f2faee3939b88f2b5d99f8af2a4dc16532c4245c0ccb6  $M/diffusion_models/flux-2-klein-4b-fp8.safetensors" | sha256sum -c -

echo "Fertig. Start: bash scripts/content/start-local-images.sh"
