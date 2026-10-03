#!/bin/sh
# shim: hook-entry
# A bun that RUNS and is >= 1.4 (Temporal), not the first on PATH: mise's shim fails with no
# version for the cwd, and an older bun would throw on the first Temporal call.
set -eu
for c in bun "$HOME/.bun/bin/bun" /opt/homebrew/bin/bun /home/linuxbrew/.linuxbrew/bin/bun; do
  p=$(command -v "$c" 2> /dev/null) && case $("$p" --version 2> /dev/null) in 1.[4-9]* | 1.[1-9][0-9]* | [2-9]*) true ;; *) false ;; esac && exec "$p" "$(dirname "$0")/enforce-terra-dispatch.ts"
done
echo "dispatch-contract: bun is required" >&2
exit 2
