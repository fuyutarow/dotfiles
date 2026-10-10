#!/bin/sh
# shim: hook-entry
set -u

mode=observe
if [ "${1:-}" = "--enforce" ]; then
  mode=enforce
  shift
fi

hook=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd -P)/goal-kernel.ts
# shellcheck source=agents/hooks/slug.sh
. "$(dirname -- "$hook")/../../hooks/slug.sh"
HOOK_SLUG=$(hook_slug "$(dirname -- "$hook")" "goal-kernel.ts")
export HOOK_SLUG

goal_kernel_is_unconfigured() {
  scan_root=$(pwd -P 2> /dev/null) || return 1
  [ -n "$scan_root" ] || return 1
  while :; do
    state_path="$scan_root/.agent-state/goal-kernel"
    if [ -e "$state_path" ] || [ -L "$state_path" ]; then
      return 1
    fi
    git_path="$scan_root/.git"
    if [ -e "$git_path" ] || [ -L "$git_path" ]; then
      return 0
    fi
    parent=${scan_root%/*}
    [ -n "$parent" ] || parent=/
    [ "$parent" = "$scan_root" ] && return 0
    scan_root=$parent
  done
}

if [ -n "${GOAL_KERNEL_BUN:-}" ]; then
  if [ -x "$GOAL_KERNEL_BUN" ]; then
    exec "$GOAL_KERNEL_BUN" "$hook"
  fi
else
  for candidate in bun "${HOME:-}/.bun/bin/bun" /opt/homebrew/bin/bun /home/linuxbrew/.linuxbrew/bin/bun; do
    runtime=$(command -v "$candidate" 2> /dev/null) && case $("$runtime" --version 2> /dev/null) in 1.[4-9]* | 1.[1-9][0-9]* | [2-9]*) true ;; *) false ;; esac && exec "$runtime" "$hook"
  done
fi

if [ "$mode" = "enforce" ]; then
  goal_kernel_is_unconfigured && exit 0
  hook_stderr 'Bun runtime required; configured or indeterminate pre-effect event blocked'
  exit 2
fi
hook_stderr 'Bun runtime required; hook event was not observed'
printf '{}\n'
exit 0
