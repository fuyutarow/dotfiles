#!/usr/bin/env zsh
# WSL-specific aliases — sourced from zsh/aliases.zsh when $IS_WSL.
# Common aliases live in zsh/aliases.zsh; only WSL-only ones belong here.

# Normalize `open` to the Windows file explorer, then build on it
alias open='explorer.exe'
alias o='open'
alias oo='explorer.exe .'   # open the current directory in Windows Explorer
alias winget='winget.exe'
alias start='cmd.exe /c start'              # launch via Windows (`s` is the common shorthand)
alias mnt-d='sudo mount -t drvfs D: /mnt/d' # mount Windows D: drive

# ── Durable remote sessions: auto-attach tmux on inbound SSH ──────────────────
# Wraps interactive SSH logins (DIRECT Tailscale → WSL sshd on :2222) in a
# persistent tmux so a dropped connection during long compute becomes a reattach,
# not a lost job. Deliberately fail-open and tightly gated:
#   • interactive logins ON A REAL PTY     ([[ $- == *i* ]] + [[ -t 0 && -t 1 ]])
#   • inbound SSH only                     ($SSH_CONNECTION set)
#   • explicit opt-out → raw shell         ($NO_TMUX env, needs `AcceptEnv NO_TMUX`
#                                            in sshd_config; or `touch ~/.no-auto-tmux`)
#   • skip if already inside tmux          (no nesting)
#   • skip Claude Code / Cursor bootstrap  ($CLAUDECODE / $SSH_ORIGINAL_COMMAND)
# Only the cheap has-session PROBE is timeout-bounded, so a wedged tmux server can
# never block login. The interactive attach is NEVER wrapped in `timeout`: that
# would SIGTERM the foreground client after N seconds (the daemonized server keeps
# the session) and force-detach you every login. `tmux new-session -A` attaches or
# creates `main` atomically; no `exec`, so a broken tmux still leaves you a shell.
#
# History: a `:2222 == break-glass relay` carve-out used to EXCLUDE port 2222 (back
# when WSL's sshd was reached via a Windows Tailscale anchor + ProxyCommand). The
# topology changed 2026-06-19 — Tailscale now runs INSIDE WSL and :2222 is the
# SINGLE primary sshd port, so that carve-out silently disabled auto-attach on
# EVERY normal login: you'd land in a bare shell and have to `tmux attach` by hand.
# Replaced by the explicit $NO_TMUX / ~/.no-auto-tmux opt-out documented above.
if [[ $- == *i* ]] \
   && [[ -n "$SSH_CONNECTION" ]] \
   && [[ -z "$NO_TMUX" ]] \
   && [[ ! -f "$HOME/.no-auto-tmux" ]] \
   && [[ -z "$TMUX" ]] \
   && [[ -z "$CLAUDECODE" ]] \
   && [[ -z "$SSH_ORIGINAL_COMMAND" ]] \
   && command -v tmux >/dev/null 2>&1; then
  if [[ -t 0 && -t 1 ]]; then
    # Probe is bounded only to fail open past a WEDGED server (timeout → 124); any
    # other result means the server is responsive or cleanly absent, so let
    # `new-session -A` decide attach-vs-create. Action stderr is left visible so a
    # real failure (terminal too small, protocol mismatch) is not swallowed.
    timeout 5 tmux has-session -t main 2>/dev/null
    case $? in
      124) ;;                                      # wedged server → drop to a normal shell
      *)   tmux new-session -A -s main || true ;;  # responsive/absent → attach-or-create
    esac
  else
    # Interactive SSH but no PTY → tmux would abort "open terminal failed: not a
    # terminal". Skip and say why instead of failing silently (today's footgun).
    print -ru2 -- "dotfiles: tmux auto-attach skipped — no PTY (reconnect with 'ssh -t', or set RequestTTY force)"
  fi
fi
