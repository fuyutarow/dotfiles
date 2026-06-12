#!/usr/bin/env zsh
# WSL-specific aliases — sourced from common/aliases.zsh when $IS_WSL.
# Common aliases live in common/aliases.zsh; only WSL-only ones belong here.

# Normalize `open` to the Windows file explorer, then build on it
alias open='explorer.exe'
alias o='open'
alias oo='explorer.exe .'   # open the current directory in Windows Explorer
alias winget='winget.exe'
alias start='cmd.exe /c start'              # launch via Windows (`s` is the common shorthand)
alias mnt-d='sudo mount -t drvfs D: /mnt/d' # mount Windows D: drive
