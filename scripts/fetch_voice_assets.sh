#!/usr/bin/env bash
# Downloads the open-source voice components and assembles them into src-tauri/voice for one
# platform: linux | windows | macos. Used by the GitHub workflow; works the same locally.
set -euo pipefail
PLAT="${1:?usage: fetch_voice_assets.sh linux|windows|macos}"
OUT=src-tauri/voice
DL="${VOICE_CACHE:-.voice-cache}"
KOKORO=https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0
ORTV=1.20.1
ORT=https://github.com/microsoft/onnxruntime/releases/download/v$ORTV
mkdir -p "$DL" "$OUT"
fetch() { [ -s "$DL/$2" ] || curl -fsSL --retry 4 -o "$DL/$2" "$1"; }

fetch "$KOKORO/kokoro-v1.0.fp16.onnx" kokoro-v1.0.fp16.onnx
fetch "$KOKORO/voices-v1.0.bin" voices-v1.0.bin
PY="$(command -v python3 || command -v python)"
"$PY" -m pip install --quiet numpy onnx
"$PY" -m pip download --quiet --no-deps -d "$DL" misaki==0.7.4 cmudict==1.1.3
"$PY" - "$DL" <<'PYEOF'
import glob, sys, zipfile
dl = sys.argv[1]
for name in ("misaki", "cmudict"):
    zipfile.ZipFile(glob.glob(f"{dl}/{name}-*.whl")[0]).extractall(f"{dl}/{name}")
PYEOF
"$PY" scripts/build_voice_assets.py --model "$DL/kokoro-v1.0.fp16.onnx" --voices "$DL/voices-v1.0.bin" \
  --misaki "$DL/misaki/misaki/data" --cmudict "$DL/cmudict/cmudict/data/cmudict.dict" --out "$OUT"

case "$PLAT" in
  linux)
    fetch "$ORT/onnxruntime-linux-x64-$ORTV.tgz" ort-linux.tgz
    tar xzf "$DL/ort-linux.tgz" -C "$DL"
    cp "$DL/onnxruntime-linux-x64-$ORTV/lib/libonnxruntime.so.$ORTV" "$OUT/libonnxruntime.so" ;;
  macos)
    fetch "$ORT/onnxruntime-osx-universal2-$ORTV.tgz" ort-mac.tgz
    tar xzf "$DL/ort-mac.tgz" -C "$DL"
    cp "$DL/onnxruntime-osx-universal2-$ORTV/lib/libonnxruntime.$ORTV.dylib" "$OUT/libonnxruntime.dylib"
    # the app loads it from Contents/Frameworks by this name
    install_name_tool -id @rpath/libonnxruntime.dylib "$OUT/libonnxruntime.dylib" || true ;;
  windows)
    fetch "$ORT/onnxruntime-win-x64-$ORTV.zip" ort-win.zip
    "$PY" -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" "$DL/ort-win.zip" "$DL"
    cp "$DL/onnxruntime-win-x64-$ORTV/lib/onnxruntime.dll" "$OUT/onnxruntime.dll" ;;
esac
ls -la "$OUT"
