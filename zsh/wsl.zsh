#!/usr/bin/env zsh
# WSL-specific aliases — sourced from zsh/aliases.zsh when $IS_WSL.
# Common aliases live in zsh/aliases.zsh; only WSL-only ones belong here.

# Normalize `open` to the Windows file explorer, then build on it
alias open='explorer.exe'
alias o='open'
alias oo='explorer.exe .'   # open the current directory in Windows Explorer
# winget: run the real thing, then refresh the Windows-exe symlink farm (zprofile.wsl,
# `link-win-exes`) so a just-installed allowlisted tool is usable in EVERY live pane
# immediately — PATH never changes, so herdr's frozen server env doesn't matter.
winget() { winget.exe "$@"; (( $+functions[link-win-exes] )) && link-win-exes; }
alias agy='agy.exe'   # Antigravity CLI: Windows-only binary (winget Google.AntigravityCLI).

# `ide` — open a WSL path in the Antigravity IDE as a REMOTE-WSL window (mirror of `e`/`code`).
# The IDE's own `antigravity-ide` launcher probes for the MICROSOFT Remote-WSL extension id
# (a leftover of the VS Code fork) and, never finding it, opens the folder as a Windows path.
# The fork does ship its own resolver (google.antigravity-remote-wsl, activation event
# onResolveRemoteAuthority:wsl), so address it directly with a remote-authority URI: that
# installs/starts ~/.antigravity-ide-server in WSL and returns immediately.
ide() {
  emulate -L zsh
  local target flag
  if (( $# == 0 )); then
    target=$(git rev-parse --show-toplevel 2>/dev/null) || target=$PWD
    [[ -n $target ]] || target=$PWD
  else
    target=$1
  fi
  target=${target:A}                                   # absolute, symlink-resolved
  [[ -d $target ]] && flag=--folder-uri || flag=--file-uri
  antigravity-ide "$flag" "vscode-remote://wsl+${WSL_DISTRO_NAME}${target}"
}
alias start='/mnt/c/Windows/System32/cmd.exe /c start'  # abs path, NOT a bare `cmd.exe` PATH shim.
# WHY abs path: a bare `cmd.exe` on PATH makes Zed's remote-SSH probe (`cmd.exe /c ver`) exec the
# real Windows cmd via WSL interop -> Zed misdetects this Linux box as Windows. See zprofile.wsl.
alias mnt-d='sudo mount -t drvfs D: /mnt/d' # mount Windows D: drive

# ── tmux: manual attach by design ─────────────────────────────────────────────
# NO auto-attach on inbound SSH — attach on YOUR timing with `t`/`ta` (aliases in
# zsh/aliases.zsh), detach with prefix+d. A durable "auto-attach tmux on inbound
# SSH" block used to live here (so a dropped connection during long compute became
# a reattach, not a lost job). Auto-attach was unwanted — removed 2026-06-23.
# To resurrect it (gating on PTY, $SSH_CONNECTION, $NO_TMUX/~/.no-auto-tmux opt-out,
# wedged-server timeout): `git show 28e93b8 -- zsh/wsl.zsh`, or `git revert` it.
