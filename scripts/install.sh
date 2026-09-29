#!/usr/bin/env bash
# Fax Inbox — Fire-and-forget Installation (Ubuntu/Linux)
# Installiert bei Bedarf Node.js, baut AppImage + .deb und richtet die App
# im Anwendungsmenü ein. Die fertige App braucht zur Laufzeit KEIN Node.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

RED=$'\033[31m'
GRN=$'\033[32m'
YLW=$'\033[33m'
BLU=$'\033[34m'
NC=$'\033[0m'

ok()   { echo "${GRN}✓${NC} $*"; }
warn() { echo "${YLW}!${NC} $*"; }
err()  { echo "${RED}✗${NC} $*" >&2; }
info() { echo "${BLU}→${NC} $*"; }

NEED_NODE_MAJOR=20
SKIP_LAUNCH=0

for arg in "$@"; do
  case "$arg" in
    --no-launch) SKIP_LAUNCH=1 ;;
    -h|--help)
      cat <<EOF
Usage: ./scripts/install.sh [--no-launch]

  Fire-and-forget:
    1. Node.js ≥ ${NEED_NODE_MAJOR} installieren falls fehlend
    2. Electron-Systempakete (Ubuntu) installieren falls nötig
    3. npm install + Linux-Build (AppImage + .deb)
    4. .deb systemweit installieren → Eintrag im App-Menü
    5. AppImage nach ~/Applications kopieren
    6. App starten (außer --no-launch)

Hinweis: Die installierte App enthält Electron/Node bereits —
Node wird nur zum einmaligen Bauen benötigt.
EOF
      exit 0
      ;;
    *) err "Unbekanntes Argument: $arg"; exit 1 ;;
  esac
done

echo "=== Fax Inbox — Installation ==="
echo "Arbeitsverzeichnis: $ROOT"
echo

if [[ "$(uname -s)" != Linux ]]; then
  err "Dieses Skript ist für Ubuntu/Linux. Unter Windows: .\\scripts\\install.ps1"
  exit 1
fi

# --- sudo helper ---
SUDO=""
if [[ "$(id -u)" -ne 0 ]]; then
  if command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  else
    err "sudo fehlt und Skript läuft nicht als root."
    exit 1
  fi
fi

run_root() {
  if [[ -n "$SUDO" ]]; then
    $SUDO "$@"
  else
    "$@"
  fi
}

# --- Node install ---
node_ok() {
  command -v node >/dev/null 2>&1 || return 1
  local major
  major="$(node -v | sed 's/^v//' | cut -d. -f1)"
  [[ "$major" -ge "$NEED_NODE_MAJOR" ]]
}

ensure_node() {
  if node_ok; then
    ok "Node.js $(node -v) vorhanden"
    return
  fi

  info "Node.js ≥ ${NEED_NODE_MAJOR} fehlt — installiere Node.js 22 (NodeSource)…"
  if ! command -v curl >/dev/null 2>&1; then
    info "Installiere curl…"
    run_root apt-get update -y
    run_root apt-get install -y curl ca-certificates gnupg
  fi

  curl -fsSL https://deb.nodesource.com/setup_22.x | run_root -E bash -
  run_root apt-get install -y nodejs

  # PATH refresh for current shell if needed
  hash -r 2>/dev/null || true

  if ! node_ok; then
    err "Node.js-Installation fehlgeschlagen."
    exit 1
  fi
  ok "Node.js $(node -v) installiert"
}

ensure_npm() {
  if ! command -v npm >/dev/null 2>&1; then
    err "npm fehlt nach Node-Installation."
    exit 1
  fi
  ok "npm $(npm -v)"
}

# --- Electron runtime libs ---
ensure_electron_deps() {
  if ! command -v apt-get >/dev/null 2>&1; then
    warn "kein apt-get — Electron-Systempakete bitte manuell prüfen"
    return
  fi

  local pkgs=(
    libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6
    xdg-utils libatspi2.0-0 libsecret-1-0 libasound2t64
  )
  # libasound2t64 (noble+) fallback to libasound2
  local missing=()
  for p in "${pkgs[@]}"; do
    if ! dpkg-query -W -f='${Status}' "$p" 2>/dev/null | grep -q "install ok installed"; then
      missing+=("$p")
    fi
  done

  # If t64 missing, try classic name later
  if ((${#missing[@]})); then
    info "Installiere Electron-Systempakete: ${missing[*]}"
    run_root apt-get update -y
    if ! run_root apt-get install -y "${missing[@]}"; then
      warn "Einige Pakete fehlgeschlagen — versuche libasound2 statt t64…"
      run_root apt-get install -y libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 \
        xdg-utils libatspi2.0-0 libsecret-1-0 libasound2 || true
    fi
  fi
  ok "Electron-Systempakete geprüft"
}

ensure_node
ensure_npm
ensure_electron_deps

info "npm install…"
npm install
ok "Abhängigkeiten installiert"

info "Baue Linux-Pakete (AppImage + .deb)…"
npm run dist:linux
ok "Build fertig → release/"

DEB="$(ls -1t release/*.deb 2>/dev/null | head -n1 || true)"
APPIMAGE="$(ls -1t release/*.AppImage 2>/dev/null | head -n1 || true)"

if [[ -z "$DEB" ]]; then
  err "Keine .deb in release/ gefunden."
  exit 1
fi

info "Installiere .deb systemweit (App-Menü): $(basename "$DEB")"
run_root apt-get install -y "./$DEB" || run_root dpkg -i "./$DEB"
run_root apt-get install -f -y >/dev/null 2>&1 || true

# Refresh desktop database / icon cache (best effort)
if command -v update-desktop-database >/dev/null 2>&1; then
  run_root update-desktop-database /usr/share/applications 2>/dev/null || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  run_root gtk-update-icon-cache -f /usr/share/icons/hicolor 2>/dev/null || true
fi
ok "Fax Inbox ist im Anwendungsmenü (Kategorie Büro/Office)"

# AppImage copy for portable use
if [[ -n "$APPIMAGE" ]]; then
  mkdir -p "$HOME/Applications"
  DEST="$HOME/Applications/$(basename "$APPIMAGE")"
  cp -f "$APPIMAGE" "$DEST"
  chmod +x "$DEST"
  ok "AppImage: $DEST"
fi

echo
ok "Installation abgeschlossen."
echo "  Menü:   „Fax Inbox“ suchen und starten"
echo "  CLI:    fax-inbox"
[[ -n "$APPIMAGE" ]] && echo "  AppImage: ~/Applications/$(basename "$APPIMAGE")"
echo

if [[ "$SKIP_LAUNCH" -eq 0 ]]; then
  if command -v fax-inbox >/dev/null 2>&1; then
    info "Starte Fax Inbox…"
    nohup fax-inbox >/dev/null 2>&1 &
  elif [[ -n "$APPIMAGE" ]]; then
    info "Starte AppImage…"
    nohup "$HOME/Applications/$(basename "$APPIMAGE")" >/dev/null 2>&1 &
  fi
fi
