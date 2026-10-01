#!/bin/bash
# electron-builder .deb after-install / configure
# Ubuntu: Chromium often aborts before JS without --no-sandbox / correct sandbox.
# IMPORTANT: Desktop Exec uses a quoted path WITH A SPACE ("/opt/Fax Inbox/...").
# Never sed [^ ]+ against that — it breaks the .desktop file.
set +e

# ---------------------------------------------------------------------------
# Stop any running Fax Inbox instance before the new binaries take effect.
#
# Why: Electron's single-instance lock (app.requestSingleInstanceLock) makes
# a freshly installed binary exit immediately while an old process is still
# running. The user then sees the OLD UI after an upgrade and thinks the
# update failed. Kill the old process here so the next launch is the new one.
# ---------------------------------------------------------------------------
stop_running_fax_inbox() {
  local pattern='Fax Inbox/fax-inbox'
  if ! pgrep -f "$pattern" >/dev/null 2>&1; then
    return 0
  fi
  echo "Fax Inbox: laufende Instanz wird für das Update beendet…" >&2
  pkill -f "$pattern" 2>/dev/null || true
  local i
  for i in 1 2 3 4 5; do
    if ! pgrep -f "$pattern" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  if pgrep -f "$pattern" >/dev/null 2>&1; then
    echo "Fax Inbox: erzwinge Beenden (SIGKILL)…" >&2
    pkill -9 -f "$pattern" 2>/dev/null || true
    sleep 1
  fi
}
stop_running_fax_inbox

APP_DIR=""
for d in "/opt/Fax Inbox" "/opt/fax-inbox" "/opt/Fax-Inbox"; do
  if [ -e "$d/chrome-sandbox" ] || [ -x "$d/fax-inbox" ]; then
    APP_DIR="$d"
    break
  fi
done
if [ -z "$APP_DIR" ]; then
  found="$(find /opt -maxdepth 2 -type f -name chrome-sandbox 2>/dev/null | head -n1 || true)"
  if [ -n "$found" ]; then
    APP_DIR="$(dirname "$found")"
  fi
fi

if [ -n "$APP_DIR" ] && [ -f "$APP_DIR/chrome-sandbox" ]; then
  chown root:root "$APP_DIR/chrome-sandbox" || true
  chmod 4755 "$APP_DIR/chrome-sandbox" || true
fi

# CLI + menu entry point: always go through a wrapper with --no-sandbox.
#
# IMPORTANT: $APP_DIR/fax-inbox MUST be the real Electron binary (ELF),
# never a shell script. If it is a script, a previous broken build wrote
# a self-recursive wrapper there — refuse to install and warn loudly.
if [ -n "$APP_DIR" ] && [ -e "$APP_DIR/fax-inbox" ]; then
  if file "$APP_DIR/fax-inbox" | grep -q 'ELF'; then
    cat > /usr/bin/fax-inbox <<EOF
#!/bin/bash
if [ -n "\$FAX_INBOX_WRAPPER_ACTIVE" ]; then
  echo "FATAL: recursive launch detected (broken /opt install)" >&2
  exit 1
fi
export FAX_INBOX_WRAPPER_ACTIVE=1
export ELECTRON_DISABLE_SANDBOX=1
exec "$APP_DIR/fax-inbox" --no-sandbox "\$@"
EOF
    chmod 755 /usr/bin/fax-inbox || true
  else
    echo "WARN: $APP_DIR/fax-inbox is not an ELF binary (found: $(file -b "$APP_DIR/fax-inbox"))" >&2
    echo "WARN: refusing to install recursive wrapper. Please reinstall the .deb from a clean build." >&2
  fi
fi

# Rewrite desktop Exec to the wrapper (safe with spaces in install path)
shopt -s nullglob
for desktop in /usr/share/applications/fax-inbox.desktop /usr/share/applications/*fax*inbox*.desktop; do
  [ -f "$desktop" ] || continue
  # Replace any Exec= line with the wrapper — do not try to splice into quoted paths
  if grep -q '^Exec=' "$desktop"; then
    sed -i 's|^Exec=.*|Exec=fax-inbox %U|' "$desktop" || true
  fi
  # Ensure Icon= is set (menu would otherwise show a generic gear)
  if grep -q '^Icon=' "$desktop"; then
    sed -i 's|^Icon=.*|Icon=fax-inbox|' "$desktop" || true
  else
    printf '\nIcon=fax-inbox\n' >> "$desktop" || true
  fi
done
shopt -u nullglob

# Pixmap fallback for DEs that ignore hicolor 1024-only installs.
# NOTE: Do NOT use ${var} here — electron-builder FpmTarget treats ${...} as
# packaging macros and fails with "Macro sz is not defined".
mkdir -p /usr/share/pixmaps 2>/dev/null || true
for sz in 256 128 64 48 512 1024; do
  src=/usr/share/icons/hicolor/"$sz"x"$sz"/apps/fax-inbox.png
  if [ -f "$src" ]; then
    cp -f "$src" /usr/share/pixmaps/fax-inbox.png 2>/dev/null || true
    break
  fi
done

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database /usr/share/applications >/dev/null 2>&1 || true
fi

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -f /usr/share/icons/hicolor >/dev/null 2>&1 || true
fi

exit 0
