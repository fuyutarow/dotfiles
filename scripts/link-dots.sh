#!/usr/bin/env bash
# Single source of truth for dotfile symlinks (macOS & WSL).
# Called by `mise run link-dots` — do not duplicate link lists anywhere else;
# add new links HERE. Layout is topic-first: one tool = one directory.
set -euo pipefail

DOTFILES="${DOTFILES:-$HOME/dotfiles}"

# --- OS detection (same convention as zsh/aliases.zsh) ---
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

# --- zsh ---
link zsh/zshrc       "$HOME/.zshrc"
if $IS_MAC; then
  link zsh/zprofile.mac "$HOME/.zprofile"
elif $IS_WSL; then
  link zsh/zprofile.wsl "$HOME/.zprofile"
fi
link sheldon         "$HOME/.config/sheldon"

# --- git ---
link git/gitconfig   "$HOME/.gitconfig"
if $IS_MAC; then
  link git/local.mac "$HOME/.local-gitconfig"
elif $IS_WSL; then
  link git/local.wsl "$HOME/.local-gitconfig"
fi

# --- tmux ---
link tmux/tmux.conf  "$HOME/.tmux.conf"

# --- lazygit (cross-OS topic; config dir differs by OS — lazygit honors XDG_CONFIG_HOME on both) ---
if $IS_MAC; then
  link lazygit/config.yml "$HOME/Library/Application Support/lazygit/config.yml"
elif $IS_WSL; then
  link lazygit/config.yml "$HOME/.config/lazygit/config.yml"
fi

# --- karabiner (macOS only) ---
if $IS_MAC; then
  rm -rf "$HOME/.config/karabiner"
  link karabiner "$HOME/.config/karabiner"
fi

# --- wsl (WSL2 system config; /etc needs root, so sudo + gated on WSL) ---
if $IS_WSL; then
  if sudo ln -sfn "$DOTFILES/wsl/wsl.conf" /etc/wsl.conf 2>/dev/null; then
    echo "linked: /etc/wsl.conf -> $DOTFILES/wsl/wsl.conf (sudo)"
  else
    echo "skip: /etc/wsl.conf needs root — run: sudo ln -sfn $DOTFILES/wsl/wsl.conf /etc/wsl.conf"
  fi
fi

if ! $IS_MAC && ! $IS_WSL; then
  echo "warn: neither macOS nor WSL detected — OS-specific links skipped" >&2
fi

echo "done."
