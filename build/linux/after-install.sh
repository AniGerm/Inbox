#!/bin/bash
# electron-builder .deb after-install / configure
# Ubuntu: Chromium often aborts before JS without --no-sandbox / correct sandbox.
# IMPORTANT: Desktop Exec uses a quoted path WITH A SPACE ("/opt/Fax Inbox/...").
# Never sed [^ ]+ against that — it breaks the .desktop file.
set +e

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

# CLI + menu entry point: always go through a wrapper with --no-sandbox
if [ -n "$APP_DIR" ] && [ -x "$APP_DIR/fax-inbox" ]; then
  cat > /usr/bin/fax-inbox <<EOF
#!/bin/bash
export ELECTRON_DISABLE_SANDBOX=1
exec "$APP_DIR/fax-inbox" --no-sandbox "\$@"
EOF
  chmod 755 /usr/bin/fax-inbox || true
fi

# Rewrite desktop Exec to the wrapper (safe with spaces in install path)
shopt -s nullglob
for desktop in /usr/share/applications/fax-inbox.desktop /usr/share/applications/*fax*inbox*.desktop; do
  [ -f "$desktop" ] || continue
  # Replace any Exec= line with the wrapper — do not try to splice into quoted paths
  if grep -q '^Exec=' "$desktop"; then
    sed -i 's|^Exec=.*|Exec=fax-inbox %U|' "$desktop" || true
  fi
done
shopt -u nullglob

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database /usr/share/applications >/dev/null 2>&1 || true
fi

exit 0
