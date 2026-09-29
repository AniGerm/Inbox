#!/usr/bin/env bash
# Fax Inbox — Dev-Setup (ohne systemweite App-Installation)
# Für die vollständige Installation inkl. App-Menü: ./install.sh bzw. ./scripts/install.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

RED=$'\033[31m'
GRN=$'\033[32m'
YLW=$'\033[33m'
NC=$'\033[0m'

ok()   { echo "${GRN}✓${NC} $*"; }
warn() { echo "${YLW}!${NC} $*"; }
err()  { echo "${RED}✗${NC} $*" >&2; }

NEED_NODE_MAJOR=20
START_DEV=0
BUILD_LINUX=0

for arg in "$@"; do
  case "$arg" in
    --dev) START_DEV=1 ;;
    --build) BUILD_LINUX=1 ;;
    --install)
      exec "$ROOT/scripts/install.sh"
      ;;
    -h|--help)
      cat <<EOF
Usage: ./scripts/setup.sh [--dev] [--build] [--install]

  (default)   Node/npm prüfen, npm install
  --dev       danach npm run dev
  --build     Linux-Pakete bauen (AppImage + deb), ohne zu installieren
  --install   Fire-and-forget → scripts/install.sh
              (Node ggf. installieren, bauen, .deb ins App-Menü)
EOF
      exit 0
      ;;
    *) err "Unbekanntes Argument: $arg"; exit 1 ;;
  esac
done

echo "=== Fax Inbox Dev-Setup ==="
echo "Tipp: Für echte Installation mit App-Menü → ./install.sh"
echo

if ! command -v node >/dev/null 2>&1; then
  err "Node.js fehlt. Für Auto-Install: ./install.sh"
  exit 1
fi

NODE_VER="$(node -v | sed 's/^v//')"
NODE_MAJOR="${NODE_VER%%.*}"
if [[ "$NODE_MAJOR" -lt "$NEED_NODE_MAJOR" ]]; then
  err "Node.js $NODE_VER — benötigt >= $NEED_NODE_MAJOR (oder ./install.sh)"
  exit 1
fi
ok "Node.js v$NODE_VER"
ok "npm $(npm -v)"

npm install
ok "npm install abgeschlossen"

if [[ "$BUILD_LINUX" -eq 1 ]]; then
  npm run dist:linux
  ok "Build fertig — siehe release/ (Installation: ./install.sh)"
fi

if [[ "$START_DEV" -eq 1 ]]; then
  exec npm run dev
fi

echo
echo "Weiter: npm run dev   oder   ./install.sh"
