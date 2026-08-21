#!/usr/bin/env bash
# Native Windows desktop installer. Docker is not used.
# On Windows this forwards to scripts/build-win.ps1.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if command -v powershell.exe >/dev/null 2>&1; then
  exec powershell.exe -ExecutionPolicy Bypass -File "$ROOT/scripts/build-win.ps1" "$@"
fi

echo "Native DeepWiki desktop installer must be built on Windows (no Docker)."
echo "Run: powershell -ExecutionPolicy Bypass -File scripts/build-win.ps1"
exit 1
