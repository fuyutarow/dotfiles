#!/bin/sh
# shim: exec-wrapper
# Resolve Bun from this repo's declaration without changing CWD or leaking the override to the CLI.
unset MISE_CONFIG_FILE
b=$(MISE_CONFIG_FILE="$HOME/dotfiles/mise.toml" mise which bun 2> /dev/null) || {
  echo "bun-exec: cannot resolve bun from ~/dotfiles/mise.toml; if Bun is not installed, run 'mise install' in ~/dotfiles" >&2
  exit 127
}
if [ -z "$b" ]; then
  echo "bun-exec: mise which bun returned no path from ~/dotfiles/mise.toml; run 'mise install' in ~/dotfiles" >&2
  exit 127
fi
exec "$b" "$@"
