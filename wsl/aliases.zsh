#!/usr/bin/env zsh
# WSL-specific aliases — sourced from common/aliases.zsh when $IS_WSL.
# Common aliases live in common/aliases.zsh; only WSL-only ones belong here.

# Normalize `open` to the Windows file explorer, then build on it
alias open='explorer.exe'
alias o='open'
alias oo='explorer.exe .'   # open the current directory in Windows Explorer
alias winget='winget.exe'
