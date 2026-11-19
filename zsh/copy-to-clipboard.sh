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

# Where OSC 52 goes. A human-typed command has /dev/tty. A process an agent spawned (a hook, a
# tool call) has no controlling terminal, but the agent it descends from still holds the pane's
# pty, and an escape written to that device reaches the same terminal (measured 2026-11-19 from a
# Claude hook in a herdr pane on WSL). So callers without a terminal need no pane, shell or prompt
# of their own: the nearest ancestor that has a terminal names the device.
osc52_tty=/dev/tty
if ! (: > /dev/tty) 2> /dev/null; then
  walk_pid=$$
  while [ "${walk_pid:-0}" -gt 1 ]; do
    walk_tty=$(ps -o tty= -p "$walk_pid" 2> /dev/null | tr -d " ") || break
    if [ -n "$walk_tty" ] && [ -c "/dev/$walk_tty" ] && [ -w "/dev/$walk_tty" ]; then
      osc52_tty=/dev/$walk_tty
      break
    fi
    walk_pid=$(ps -o ppid= -p "$walk_pid" 2> /dev/null | tr -d " ") || break
  done
fi

# The OSC 52 branches end here: status 1 names the reason, so a caller never reports a bare code.
osc52_exit() {
  [ "$tty_ok" -eq 0 ] || echo "copy-to-clipboard: no terminal reachable for OSC 52 (tried $osc52_tty)" >&2
  exit "$tty_ok"
}

osc52_copy() {
  # /dev/tty writes are wrapped in a subshell so a failed OPEN (not just a failed write) can't
  # leak its "cannot create /dev/tty" message past the 2>/dev/null — a bare `cmd > /dev/tty
  # 2> /dev/null` can still print that message to the REAL stderr, because the shell reports a
  # redirection-setup failure before the command's own fd2 redirect takes effect.
  if (printf '\033]52;c;%s\a' "$(printf '%s' "$data" | base64 | tr -d '\n')" > "$osc52_tty") 2> /dev/null; then
    tty_ok=0
  fi
}

echo_back() {
  [ "${COPY_TO_CLIPBOARD_QUIET:-0}" = 1 ] && return 0
  (printf '%s\n' "$data" > /dev/tty) 2> /dev/null || true
}

# Mirror smart-open.ts pickForward / tools/shared/src/sockets.ts remoteForwards + fileKey:
# an explicit SMART_OPEN_SOCKET (even empty) pins discovery; otherwise any non-symlink
# socket named smart-open-<real user>--<nonempty alias>.sock in SMART_OPEN_SOCKET_DIR
# (default /tmp) is a bound forward. Ordering by mtime is immaterial for this boolean.
# Check on every copy: a herdr server started outside SSH cannot refresh its environment
# on attach. Limit this additional signal to herdr panes, so a plain local shell remains local.
# This is bound-forward discovery, not a receiver ACK; OSC 52 itself travels through herdr.
herdr_remote_attached() {
  [ "${HERDR_ENV:-}" = 1 ] || return 1
  if [ "${SMART_OPEN_SOCKET+x}" = x ]; then
    [ ! -L "$SMART_OPEN_SOCKET" ] && [ -S "$SMART_OPEN_SOCKET" ]
    return
  fi
  clip_remote_user=$(id -un) || return 1
  clip_remote_dir=${SMART_OPEN_SOCKET_DIR-/tmp}
  [ -n "$clip_remote_dir" ] || clip_remote_dir=.
  for clip_remote_socket in "$clip_remote_dir/smart-open-$clip_remote_user--"*.sock; do
    [ "$clip_remote_socket" != "$clip_remote_dir/smart-open-$clip_remote_user--.sock" ] || continue
    if [ ! -L "$clip_remote_socket" ] && [ -S "$clip_remote_socket" ]; then
      return 0
    fi
  done
  return 1
}

# Windows clipboards are per Windows session. A pane that kept the WSL_INTEROP it inherited (zshenv
# picks the newest socket once) may point at a dead socket or at session 0, and clip.exe then fills
# a clipboard nobody reads. scripts/wsl-interop-session.ts prints the live socket whose Windows
# processes run in explorer.exe's session. Only clip.exe gets it (clip_exe), never this shell's
# environment. When none qualifies the inherited WSL_INTEROP stays — today's behavior — and one
# stderr line says so. The helper's stdout is the socket and nothing else; its stderr is the reason.
desktop_socket=
desktop_interop_socket() {
  self=$(readlink -f "$0" 2> /dev/null) || self=$0
  case $self in
    */*) helper=${self%/*}/../scripts/wsl-interop-session.ts ;;
    *) helper=../scripts/wsl-interop-session.ts ;;
  esac
  if command -v bun > /dev/null 2>&1; then
    desktop_out=$(bun "$helper" 2>&1) && desktop_rc=0 || desktop_rc=$?
  else
    desktop_out='bun is not installed'
    desktop_rc=127
  fi
  desktop_last=$(printf '%s\n' "$desktop_out" | tail -n 1)
  if [ "$desktop_rc" -eq 0 ] && [ -S "$desktop_last" ]; then
    desktop_socket=$desktop_last
    return 0
  fi
  [ "$desktop_rc" -ne 0 ] || desktop_last="the helper printed no socket ($desktop_last)"
  printf 'copy-to-clipboard: no desktop-session WSL interop socket (%s); using the inherited WSL_INTEROP\n' \
    "${desktop_last#wsl-interop-session: }" >&2
}

clip_exe() {
  if [ -n "$desktop_socket" ]; then
    WSL_INTEROP=$desktop_socket clip.exe
  else
    clip.exe
  fi
}

# Over SSH or in a remote-attached herdr pane: native tools target the SERVER, never the CLIENT —
# route via OSC 52 so the copy lands where the human's terminal actually is. Needs an OSC
# 52-capable terminal and, inside tmux, `set -g set-clipboard on` (tmux/clipboard.conf).
# Herdr 0.9.5 forwards pane OSC 52 ClipboardWrite events to its foreground client by default
# (upstream src/server/headless/notifications.rs); no clipboard configuration is required.
if [ -n "${SSH_CONNECTION:-}${SSH_TTY:-}" ] || herdr_remote_attached; then
  echo_back
  osc52_copy
  osc52_exit
fi

case "$(uname -s)" in
  Linux)
    if [ -n "${WSL_DISTRO_NAME:-}" ] || command -v clip.exe > /dev/null 2>&1; then
      echo_back
      desktop_interop_socket
      printf '%s' "$data" | iconv -f UTF-8 -t UTF-16LE | clip_exe
    elif command -v xclip > /dev/null 2>&1; then
      echo_back
      printf '%s' "$data" | xclip -selection clipboard
    elif command -v xsel > /dev/null 2>&1; then
      echo_back
      printf '%s' "$data" | xsel --clipboard --input
    else
      echo_back
      osc52_copy
      osc52_exit
    fi
    ;;
  Darwin)
    echo_back
    printf '%s' "$data" | pbcopy
    ;;
  *)
    echo_back
    osc52_copy
    osc52_exit
    ;;
esac
