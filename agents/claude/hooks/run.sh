#!/bin/sh
# shim: hook-entry
# Hook runner — the ONLY shell run.sh-dispatched hook needs; SessionStart's
# herdr-agent-state.sh (vendored, see its own header) is invoked directly and bypasses
# this file. Locates bun (hooks can run with a narrow PATH) and execs the given .ts hook,
# stdin passed through untouched.
#
#   run.sh [--fail-closed] <hook>.ts
#
# Fail direction when bun is missing:
#   (default)     exit 0 silently              — Stop guards: never break a turn
#   --fail-closed print a PreToolUse deny JSON — policy gates: never fail open
set -u

dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)

mode=open
if [ "${1:-}" = "--fail-closed" ]; then
  mode=closed
  shift
fi
hook="$dir/${1:?usage: run.sh [--fail-closed] <hook>.ts}"

for c in bun "$HOME/.bun/bin/bun" /opt/homebrew/bin/bun \
  /home/linuxbrew/.linuxbrew/bin/bun /usr/local/bin/bun; do
  if p=$(command -v "$c" 2> /dev/null); then
    exec "$p" "$hook"
  fi
done

if [ "$mode" = "closed" ]; then
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"hook runner: no bun runtime found to run %s — install bun (brew install bun) and retry"}}\n' \
    "$(basename "$hook")"
fi
exit 0
