#!/bin/sh
# shim: hook-entry
# Codex Stop adapter. The policy is fail-open if Bun is unavailable: it must not trap a session.
set -eu
dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd -P)
# shellcheck source=agents/hooks/slug.sh
. "$dir/../../hooks/slug.sh"
HOOK_SLUG=$(hook_slug "$dir" "enforce-reply-language.ts")
export HOOK_SLUG
for c in bun "$HOME/.bun/bin/bun" /opt/homebrew/bin/bun /home/linuxbrew/.linuxbrew/bin/bun; do
  p=$(command -v "$c" 2> /dev/null) && case $("$p" --version 2> /dev/null) in 1.[4-9]* | 1.[1-9][0-9]* | [2-9]*) true ;; *) false ;; esac && exec "$p" "$dir/enforce-reply-language.ts"
done
exit 0
