#!/usr/bin/env zsh
# macOS-specific aliases — sourced from zsh/aliases.zsh when $IS_MAC.
# Common aliases live in zsh/aliases.zsh; only macOS-only ones belong here.

# `open` is native on macOS; mirror the WSL shorthands so `o`/`oo` work the same on both
alias o='open'
alias oo='open .'        # open the current directory in Finder
alias start='open -a'    # launch a macOS app by name (`s` is the common shorthand)
