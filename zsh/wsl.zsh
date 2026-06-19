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
# Wraps interactive SSH logins (via the DIRECT Tailscale path) in a persistent
# tmux so a dropped connection during long compute becomes a reattach, not a lost
# job. Deliberately fail-open and tightly gated:
#   • only interactive SSH logins         ([[ $- == *i* ]] + $SSH_CONNECTION)
#   • EXCLUDE the :2222 break-glass relay  → that path is ALWAYS a raw recovery shell
#   • skip if already inside tmux          (no nesting)
#   • skip Claude Code / Cursor bootstrap  ($CLAUDECODE / $SSH_ORIGINAL_COMMAND)
#   • timeout-bounded so a wedged tmux server can never block the login shell
if [[ $- == *i* ]] \
   && [[ -n "$SSH_CONNECTION" ]] \
   && [[ "${SSH_CONNECTION##* }" != "2222" ]] \
   && [[ -z "$TMUX" ]] \
   && [[ -z "$CLAUDECODE" ]] \
   && [[ -z "$SSH_ORIGINAL_COMMAND" ]] \
   && command -v tmux >/dev/null 2>&1; then
  if timeout 5 tmux has-session -t main 2>/dev/null; then
    tmux attach -t main 2>/dev/null || true
  else
    timeout 5 tmux new-session -s main 2>/dev/null || true
  fi
fi
