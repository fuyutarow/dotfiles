#!/bin/sh
# shim: hook-entry
set -u
hook=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)/task-continuity.ts
for candidate in bun "$HOME/.bun/bin/bun" /opt/homebrew/bin/bun /home/linuxbrew/.linuxbrew/bin/bun; do
  runtime=$(command -v "$candidate" 2>/dev/null) && exec "$runtime" "$hook"
done
exit 0
