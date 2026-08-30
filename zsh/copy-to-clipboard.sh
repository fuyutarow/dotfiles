#!/bin/sh
# Standalone, non-interactive-shell-safe clipboard copy. Reads stdin, copies it to the right
# place for the current environment, echoing it back to the controlling terminal (like tee)
# when one is attached.
#
# Extracted from zsh/aliases.zsh's copytoclipboard() so a NON-interactive caller — a Claude
# Code slash command's `!command` shell step (agents/commands/mycopy.md), which has no zsh
# functions/aliases loaded — can reuse the exact same SSH/WSL/mac logic instead of a second,
# drifting copy. zsh/aliases.zsh's copytoclipboard() now just execs this file; THIS is the
# single source of truth. Deliberately POSIX sh, not zsh: no $IS_WSL/$IS_MAC (those are zsh
# globals set only in an interactive shell) — detects directly via uname/$WSL_DISTRO_NAME/
# command -v so it needs nothing sourced first.
#
# EXIT CODE IS A DELIVERY SIGNAL, not just success/failure of this script, on the OSC 52
# branch specifically: 0 = the /dev/tty write genuinely succeeded, 1 = it did not (any other
# branch — a native clipboard tool — needs no terminal at all and always exits via its own
# tool's status). Root-caused 2026-08-30 investigating /mycopy: a process Claude Code itself
# spawns (a Bash-tool command, a hook — tested both) has NO controlling terminal at all ("not
# a tty", open("/dev/tty") -> ENXIO), same locally as over SSH. A directly-typed interactive
# shell command (this script run as `c`/`pp` by a human) has a real tty and does not hit this.
# Callers that can't assume a human typed the command (agents/commands/mycopy.md) MUST check
# this exit code on the OSC 52 branch — success is not implied just because the script ran.
set -eu

data=$(cat)
tty_ok=1 # 1 = not yet proven reachable; osc52_copy flips this to 0 on a real write

osc52_copy() {
  # /dev/tty writes are wrapped in a subshell so a failed OPEN (not just a failed write) can't
  # leak its "cannot create /dev/tty" message past the 2>/dev/null — a bare `cmd > /dev/tty
  # 2> /dev/null` can still print that message to the REAL stderr, because the shell reports a
  # redirection-setup failure before the command's own fd2 redirect takes effect.
  if ( printf '\033]52;c;%s\a' "$(printf '%s' "$data" | base64 | tr -d '\n')" > /dev/tty ) 2> /dev/null; then
    tty_ok=0
  fi
}

echo_back() {
  ( printf '%s\n' "$data" > /dev/tty ) 2> /dev/null || true
}

# Over SSH (incl. WSL-over-SSH): native tools target the SERVER, never the terminal CLIENT —
# route via OSC 52 so the copy lands where the human's terminal actually is. Needs an OSC
# 52-capable terminal and, inside tmux, `set -g set-clipboard on` (tmux/clipboard.conf).
if [ -n "${SSH_CONNECTION:-}${SSH_TTY:-}" ]; then
  echo_back
  osc52_copy
  exit "$tty_ok"
fi

case "$(uname -s)" in
  Linux)
    if [ -n "${WSL_DISTRO_NAME:-}" ] || command -v clip.exe > /dev/null 2>&1; then
      echo_back
      printf '%s' "$data" | iconv -f UTF-8 -t UTF-16LE | clip.exe
    elif command -v xclip > /dev/null 2>&1; then
      echo_back
      printf '%s' "$data" | xclip -selection clipboard
    elif command -v xsel > /dev/null 2>&1; then
      echo_back
      printf '%s' "$data" | xsel --clipboard --input
    else
      echo_back
      osc52_copy
      exit "$tty_ok"
    fi
    ;;
  Darwin)
    echo_back
    printf '%s' "$data" | pbcopy
    ;;
  *)
    echo_back
    osc52_copy
    exit "$tty_ok"
    ;;
esac
