#!/bin/bash
# electron-builder .deb after-install
# Ubuntu/AppArmor: Chromium often aborts before any JS if chrome-sandbox is wrong
# or if the binary is launched without --no-sandbox. Fix sandbox + CLI wrapper.
set -e

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

# Menu entries usually call /usr/bin/fax-inbox — wrap so --no-sandbox is always set
# (app.commandLine switches in main.js run too late if Chromium aborts first).
if [ -n "$APP_DIR" ] && [ -x "$APP_DIR/fax-inbox" ]; then
  cat > /usr/bin/fax-inbox <<EOF
#!/bin/bash
export ELECTRON_DISABLE_SANDBOX=1
exec "$APP_DIR/fax-inbox" --no-sandbox "\$@"
EOF
  chmod 755 /usr/bin/fax-inbox
fi

# Also patch desktop Exec lines that point at the binary directly
for desktop in /usr/share/applications/fax-inbox.desktop /usr/share/applications/*fax*inbox*.desktop; do
  [ -f "$desktop" ] || continue
  if grep -q '^Exec=' "$desktop" && ! grep -q -- '--no-sandbox' "$desktop"; then
    # Exec=fax-inbox …  or  Exec="/opt/Fax Inbox/fax-inbox" …
    sed -i -E 's|^Exec=([^ ]+)( .*)$|Exec=\1 --no-sandbox\2|; t; s|^Exec=([^ ]+)$|Exec=\1 --no-sandbox|' "$desktop" || true
  fi
done

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database /usr/share/applications 2>/dev/null || true
fi
