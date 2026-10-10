#!/bin/sh
# shim: hook-entry
# Hook runner for agents/hooks (Claude AND Codex) and agents/claude/hooks (symlink here).
# Locates a bun that RUNS — not merely exists: in a non-interactive shell the first `bun` on
# PATH is mise's shim, which exits non-zero with no version declared for the cwd, and a
# fail-closed gate then fails OPEN (r99 2026-09-27: storage gate let `cargo build` through
# under Codex). It must also be >= 1.4: hooks use Temporal, and an older bun throws on the
# first call — the same fail-OPEN by another route. Then execs the given .ts hook, stdin passed
# through untouched.
#   run.sh [--fail-closed] <hook>.ts
# Fail direction when no bun runs:
#   (default)     exit 0 silently              — Stop guards: never break a turn
#   --fail-closed print a PreToolUse deny JSON — policy gates: never fail open
set -u

dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd -P)

mode=open
if [ "${1:-}" = "--fail-closed" ]; then
  mode=closed
  shift
fi
hook="$dir/${1:?usage: run.sh [--fail-closed] <hook>.ts}"
slug_lib="$dir/slug.sh"
[ -f "$slug_lib" ] || slug_lib="$dir/../../hooks/slug.sh"
# shellcheck source=agents/hooks/slug.sh
. "$slug_lib"
HOOK_SLUG=$(hook_slug "$dir" "${1}")
export HOOK_SLUG

for c in bun "$HOME/.bun/bin/bun" /opt/homebrew/bin/bun \
  /home/linuxbrew/.linuxbrew/bin/bun /usr/local/bin/bun; do
  if p=$(command -v "$c" 2> /dev/null) && case $("$p" --version 2> /dev/null) in 1.[4-9]* | 1.[1-9][0-9]* | [2-9]*) true ;; *) false ;; esac then
    exec "$p" "$hook"
  fi
done

if [ "$mode" = "closed" ]; then
  hook_deny "hook runner: no bun >= 1.4 found to run $(basename "$hook") — install or upgrade bun (brew install bun), then mise run doctor"
fi
exit 0
