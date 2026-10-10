#!/bin/sh
# shim: exec-wrapper
# Resolve Bun from this repo's declaration without changing CWD or leaking the override to the CLI.
exec env MISE_CONFIG_FILE="$HOME/dotfiles/mise.toml" mise exec -- env -u MISE_CONFIG_FILE bun "$@"
