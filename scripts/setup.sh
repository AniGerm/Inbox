#!/usr/bin/env bash
# Fax Inbox — Setup für Ubuntu/Linux (und macOS mit Node)
# Prüft Abhängigkeiten, installiert npm-Pakete, optional Dev-Start.
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
    -h|--help)
      cat <<EOF
Usage: ./scripts/setup.sh [--dev] [--build]

  (default)  Node/npm prüfen, npm install
  --dev      danach npm run dev starten
  --build    danach Linux-Installer bauen (AppImage + deb)
EOF
      exit 0
      ;;
    *) err "Unbekanntes Argument: $arg"; exit 1 ;;
  esac
done

echo "=== Fax Inbox Setup ==="
echo "Arbeitsverzeichnis: $ROOT"
echo

# --- OS ---
OS="$(uname -s)"
case "$OS" in
  Linux) ok "OS: Linux" ;;
  Darwin) ok "OS: macOS (Dev ok; Installer-Targets siehe README)" ;;
  *) warn "OS: $OS — primär Windows/Ubuntu getestet" ;;
esac

# --- Node ---
if ! command -v node >/dev/null 2>&1; then
  err "Node.js fehlt."
  echo "  Ubuntu:  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs"
  echo "  oder:    sudo apt-get install -y nodejs npm   (ggf. zu alt — mind. Node $NEED_NODE_MAJOR)"
  echo "  Download: https://nodejs.org/"
  exit 1
fi

NODE_VER="$(node -v | sed 's/^v//')"
NODE_MAJOR="${NODE_VER%%.*}"
if [[ "$NODE_MAJOR" -lt "$NEED_NODE_MAJOR" ]]; then
  err "Node.js $NODE_VER gefunden — benötigt wird >= $NEED_NODE_MAJOR"
  exit 1
fi
ok "Node.js v$NODE_VER"

# --- npm ---
if ! command -v npm >/dev/null 2>&1; then
  err "npm fehlt (kommt normalerweise mit Node)."
  exit 1
fi
ok "npm $(npm -v)"

# --- Linux GUI / Electron runtime hints ---
if [[ "$OS" == Linux ]]; then
  if [[ -z "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]]; then
    warn "Kein DISPLAY/WAYLAND_DISPLAY — GUI startet erst in einer Desktop-Session."
  else
    ok "Display-Umgebung vorhanden"
  fi
  # Common Electron libs on Ubuntu (best-effort check)
  MISSING=()
  for lib in libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 xdg-utils libatspi2.0-0 libsecret-1-0; do
    if command -v dpkg-query >/dev/null 2>&1; then
      if ! dpkg-query -W -f='${Status}' "$lib" 2>/dev/null | grep -q "install ok installed"; then
        MISSING+=("$lib")
      fi
    fi
  done
  if ((${#MISSING[@]})); then
    warn "Möglicherweise fehlende Systempakete für Electron:"
    echo "  sudo apt-get install -y ${MISSING[*]}"
  else
    if command -v dpkg-query >/dev/null 2>&1; then
      ok "Übliche Electron-Systempakete vorhanden (oder nicht per dpkg prüfbar)"
    fi
  fi
fi

# --- npm install ---
echo
echo "Installiere npm-Abhängigkeiten…"
npm install
ok "npm install abgeschlossen"

# --- sanity ---
if [[ ! -f package.json ]]; then
  err "package.json fehlt"
  exit 1
fi
ok "package.json vorhanden"

echo
echo "Fertig. Nächste Schritte:"
echo "  Entwicklung:  npm run dev"
echo "  Linux-Build:  npm run dist:linux   → Artefakte in release/"
echo "  Windows:      scripts\\\\setup.ps1 auf dem Windows-Rechner (kein Cross-Build nötig)"
echo

if [[ "$BUILD_LINUX" -eq 1 ]]; then
  echo "Baue Linux-Installer…"
  npm run dist:linux
  ok "Build fertig — siehe release/"
fi

if [[ "$START_DEV" -eq 1 ]]; then
  echo "Starte Dev-App…"
  exec npm run dev
fi
