#!/bin/sh
# shim: hook-entry
# A bun that RUNS and is >= 1.4 (Temporal), not the first on PATH: mise's shim fails with no
# version for the cwd, and an older bun would throw on the first Temporal call.
set -eu
dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd -P)
# shellcheck source=agents/hooks/slug.sh
. "$dir/../../hooks/slug.sh"
HOOK_SLUG=$(hook_slug "$dir" "enforce-dispatch-contract.ts")
export HOOK_SLUG
for c in bun "$HOME/.bun/bin/bun" /opt/homebrew/bin/bun /home/linuxbrew/.linuxbrew/bin/bun; do
  p=$(command -v "$c" 2> /dev/null) && case $("$p" --version 2> /dev/null) in 1.[4-9]* | 1.[1-9][0-9]* | [2-9]*) true ;; *) false ;; esac && exec "$p" "$(dirname "$0")/enforce-dispatch-contract.ts"
done
hook_stderr "bun is required"
exit 2
