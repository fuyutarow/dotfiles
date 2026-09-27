#!/bin/sh
# shim: hook-entry
# A bun that RUNS, not the first on PATH: mise's shim fails with no version for the cwd.
set -eu
for c in bun "$HOME/.bun/bin/bun" /opt/homebrew/bin/bun /home/linuxbrew/.linuxbrew/bin/bun; do
  p=$(command -v "$c" 2> /dev/null) && "$p" --version > /dev/null 2>&1 && exec "$p" "$(dirname "$0")/enforce-terra-dispatch.ts"
done
echo "dispatch-contract: bun is required" >&2
exit 2
