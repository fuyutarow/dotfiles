#!/bin/sh
# shim: exec-wrapper
# Resolve Bun from this repo's declaration without changing CWD or leaking the override to the CLI.
unset MISE_CONFIG_FILE
d=${DOTFILES:-}
if [ ! -f "$d/mise.toml" ]; then
  d=$(CDPATH='' cd -- "$(dirname -- "$(realpath "$0")")/.." && pwd)
fi
if [ ! -f "$d/mise.toml" ]; then d="$HOME/dotfiles"; fi
# A caller that already resolved Bun can bypass mise, even when HOME is a scratch directory.
if [ -n "${DOTFILES_BUN_PATH:-}" ]; then
  b=$DOTFILES_BUN_PATH
else
  # Keep mise's normal data location first. A reference render may have replaced HOME.
  b=$(MISE_CONFIG_FILE="$d/mise.toml" mise which bun 2> /dev/null) || b=$(MISE_CONFIG_FILE="$d/mise.toml" MISE_DATA_DIR="${MISE_DATA_DIR:-$(dirname -- "$d")/.local/share/mise}" mise which bun 2> /dev/null) || {
    echo "bun-exec: cannot resolve bun from $d/mise.toml; run 'mise install' in $d" >&2
    exit 127
  }
fi
if [ -z "$b" ]; then
  echo "bun-exec: mise which bun returned no path from $d/mise.toml; run 'mise install' in $d" >&2
  exit 127
fi
exec "$b" "$@"
