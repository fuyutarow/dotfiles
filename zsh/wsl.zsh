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

# ── tmux: manual attach by design ─────────────────────────────────────────────
# NO auto-attach on inbound SSH — attach on YOUR timing with `t`/`ta` (aliases in
# zsh/aliases.zsh), detach with prefix+d. A durable "auto-attach tmux on inbound
# SSH" block used to live here (so a dropped connection during long compute became
# a reattach, not a lost job). Auto-attach was unwanted — removed 2026-06-23.
# To resurrect it (gating on PTY, $SSH_CONNECTION, $NO_TMUX/~/.no-auto-tmux opt-out,
# wedged-server timeout): `git show 28e93b8 -- zsh/wsl.zsh`, or `git revert` it.
