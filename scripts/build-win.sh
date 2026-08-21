#!/usr/bin/env bash
# Build DeepWiki image + Windows NSIS installer.
# Native Windows: prefer scripts/build-win.ps1
# Linux CI / Docker Desktop: this script, or docker compose -f docker-compose.build-desktop.yml
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
IMAGE_TAG="${IMAGE_TAG:-deepwiki-open:desktop}"

if [[ "${SKIP_IMAGE:-}" != "1" ]]; then
  docker build -t "$IMAGE_TAG" .
  mkdir -p electron/resources
  docker save "$IMAGE_TAG" -o electron/resources/deepwiki-open.tar
  ls -lh electron/resources/deepwiki-open.tar
fi

if [[ "${USE_WINE_BUILDER:-}" == "1" ]]; then
  docker compose -f docker-compose.build-desktop.yml run --rm win-installer
else
  npm ci --legacy-peer-deps
  npx electron-builder --win nsis --publish never
fi

ls -lh dist/desktop/*.exe 2>/dev/null || true
