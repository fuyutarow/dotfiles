#!/usr/bin/env bash
# Single source of truth for dotfile symlinks (macOS & WSL).
# Called by `mise run link-dots` — do not duplicate link lists anywhere else;
# add new links HERE.
set -euo pipefail

DOTFILES="${DOTFILES:-$HOME/dotfiles}"

# --- OS detection (same convention as common/aliases.zsh) ---
IS_MAC=false
IS_WSL=false
[[ "$(uname -s)" == Darwin ]] && IS_MAC=true
[[ "$(uname -r)" == *[Mm]icrosoft* ]] && IS_WSL=true

link() { # link <repo-relative source> <target>
  local src="$DOTFILES/$1" dst="$2"
  [[ -e "$src" ]] || { echo "skip (missing): $src"; return 0; }
  mkdir -p "$(dirname "$dst")"
  ln -sfn "$src" "$dst"
  echo "linked: $dst -> $src"
}

# --- Common (both OSes) ---
link common/.zshrc      "$HOME/.zshrc"
link common/.gitconfig  "$HOME/.gitconfig"
link common/.tmux.conf  "$HOME/.tmux.conf"
link common/sheldon     "$HOME/.config/sheldon"

# --- OS-specific ---
if $IS_MAC; then
  link mac/.zprofile        "$HOME/.zprofile"
  link mac/.local-gitconfig "$HOME/.local-gitconfig"
  # Karabiner (whole directory)
  rm -rf "$HOME/.config/karabiner"
  link karabiner "$HOME/.config/karabiner"
elif $IS_WSL; then
  link wsl/.zprofile        "$HOME/.zprofile"
  link wsl/.local-gitconfig "$HOME/.local-gitconfig"
else
  echo "warn: neither macOS nor WSL detected — only common links created" >&2
fi

echo "done."
