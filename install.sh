#!/usr/bin/env bash
# Convenience wrapper — siehe scripts/install.sh
exec "$(cd "$(dirname "$0")" && pwd)/scripts/install.sh" "$@"
