#!/bin/bash
# electron-builder .deb after-install — chrome-sandbox needs root + setuid.
# Path contains a space ("Fax Inbox"); must be quoted or setuid never applies.
set -e
SANDBOX="/opt/Fax Inbox/chrome-sandbox"
if [ -f "$SANDBOX" ]; then
  chown root:root "$SANDBOX"
  chmod 4755 "$SANDBOX"
fi
