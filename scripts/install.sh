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

  # AppImage needs FUSE2 on Ubuntu 22.04+ (fuse3 alone is not enough).
  # libasound2t64 (noble+) may fall back to libasound2 / libfuse2t64 below.
  local pkgs=(
    libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6
    xdg-utils libatspi2.0-0 libsecret-1-0 libasound2t64
    libgbm1 libdrm2 libxkbcommon0 libxrandr2 libxcomposite1
    libxdamage1 libxfixes3 libcups2 libfuse2
  )
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
      warn "Einige Pakete fehlgeschlagen — versuche Fallback-Namen…"
      run_root apt-get install -y libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 \
        xdg-utils libatspi2.0-0 libsecret-1-0 libasound2 libgbm1 libdrm2 \
        libxkbcommon0 libfuse2 || \
      run_root apt-get install -y libfuse2t64 || true
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

# Chromium aborts before any JS if chrome-sandbox exists but is not root:4755.
# electron-builder postinst often fails when productName contains a space.
fix_chrome_sandbox() {
  local candidates=(
    "/opt/Fax Inbox/chrome-sandbox"
    "/opt/fax-inbox/chrome-sandbox"
    "/opt/Fax-Inbox/chrome-sandbox"
  )
  local found=""
  local c
  for c in "${candidates[@]}"; do
    if [[ -e "$c" ]]; then
      found="$c"
      break
    fi
  done
  if [[ -z "$found" ]]; then
    found="$(find /opt -maxdepth 2 -type f -name chrome-sandbox 2>/dev/null | head -n1 || true)"
  fi
  if [[ -n "$found" ]]; then
    run_root chown root:root "$found"
    run_root chmod 4755 "$found"
    ok "chrome-sandbox SUID: $found ($(stat -c '%a %U:%G' "$found" 2>/dev/null || true))"
  else
    warn "chrome-sandbox nicht gefunden — Starte mit --no-sandbox"
  fi

  # Ensure menu launches pass --no-sandbox (Chromium reads this before JS).
  # Desktop Exec is quoted with a space in the path — rewrite to wrapper, do not splice.
  local desktop
  for desktop in /usr/share/applications/fax-inbox.desktop /usr/share/applications/*fax*inbox*.desktop; do
    [[ -f "$desktop" ]] || continue
    run_root sed -i 's|^Exec=.*|Exec=fax-inbox %U|' "$desktop" || true
    if [[ -f "$desktop" ]]; then
      ok "Desktop-Eintrag: $(basename "$desktop") → $(grep '^Exec=' "$desktop" || true)"
    fi
  done

  # CLI wrapper
  local app_bin=""
  for c in "/opt/Fax Inbox/fax-inbox" "/opt/fax-inbox/fax-inbox" "/opt/Fax-Inbox/fax-inbox"; do
    if [[ -x "$c" ]]; then
      app_bin="$c"
      break
    fi
  done
  if [[ -n "$app_bin" ]]; then
    run_root tee /usr/bin/fax-inbox >/dev/null <<EOF
#!/bin/bash
export ELECTRON_DISABLE_SANDBOX=1
exec "$app_bin" --no-sandbox "\$@"
EOF
    run_root chmod 755 /usr/bin/fax-inbox
    ok "CLI-Wrapper: /usr/bin/fax-inbox → $app_bin --no-sandbox"
  fi
}
fix_chrome_sandbox

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
  LOG_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/fax-inbox"
  mkdir -p "$LOG_DIR"
  LOG="$LOG_DIR/launch.log"

  launch_and_verify() {
    local cmd=("$@")
    info "Starte Fax Inbox… (Log: $LOG)"
    {
      echo "=== $(date -Iseconds) launch: ${cmd[*]} ==="
      echo "DISPLAY=${DISPLAY-} WAYLAND_DISPLAY=${WAYLAND_DISPLAY-} XDG_SESSION_TYPE=${XDG_SESSION_TYPE-}"
      "${cmd[@]}"
      echo "exit=$?"
    } >>"$LOG" 2>&1 &
    local pid=$!
    sleep 2
    if ! kill -0 "$pid" 2>/dev/null; then
      wait "$pid" 2>/dev/null || true
      err "App ist sofort wieder beendet — vermutlich fehlende Libs oder Sandbox."
      echo "---- letzte Logzeilen ----" >&2
      tail -n 50 "$LOG" >&2 || true
      echo "-------------------------" >&2
      warn "Manuell im Terminal starten: ${cmd[*]}"
      warn "Oder Log prüfen: $LOG"
      return 1
    fi
    ok "Fax Inbox läuft (PID $pid) — Fenster sollte sichtbar sein"
    return 0
  }

  if command -v fax-inbox >/dev/null 2>&1; then
    launch_and_verify fax-inbox --no-sandbox || true
  elif [[ -n "$APPIMAGE" ]]; then
    launch_and_verify env ELECTRON_DISABLE_SANDBOX=1 "$HOME/Applications/$(basename "$APPIMAGE")" --no-sandbox || true
  fi
fi
