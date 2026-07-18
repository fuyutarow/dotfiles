#!/usr/bin/env bash
# Single source of truth for dotfile symlinks (macOS & WSL).
# Called by `mise run link:dots` — do not duplicate link lists anywhere else;
# add new links HERE. Layout is topic-first: one tool = one directory.
#
# Modes (ONE script + a flag, not two scripts):
#   (default)  SAFE   — idempotent/harmless: never clobber a non-symlink file,
#                       never sudo/rm unless actually needed. This is the default
#                       so the post-merge hook can relink on every `git pull`.
#   --force           — overwrite a regular file with the symlink. For the
#                       intentional `mise run link:dots` (initial setup / fix drift).
set -euo pipefail

DOTFILES="${DOTFILES:-$HOME/dotfiles}"

FORCE=false
[[ ${1:-} == "--force" ]] && FORCE=true

# --- OS detection (same convention as zsh/aliases.zsh) ---
IS_MAC=false
IS_WSL=false
[[ "$(uname -s)" == Darwin ]] && IS_MAC=true
[[ "$(uname -r)" == *[Mm]icrosoft* ]] && IS_WSL=true

link() { # link <repo-relative source> <target>
  local src="$DOTFILES/$1" dst="$2"
  [[ -e $src ]] || {
    echo "skip (missing): $src"
    return 0
  }
  [[ -L $dst && "$(readlink "$dst")" == "$src" ]] && return 0 # already correct -> no-op
  if ! $FORCE && [[ -e $dst && ! -L $dst ]]; then
    echo "skip (exists, not symlink): $dst"
    return 0 # safe (default): don't clobber a real file
  fi
  mkdir -p "$(dirname "$dst")"
  ln -sfn "$src" "$dst"
  echo "linked: $dst -> $src"
}

# --- zsh ---
link zsh/zshenv "$HOME/.zshenv"
link zsh/zshrc "$HOME/.zshrc"
if $IS_MAC; then
  link zsh/zprofile.mac "$HOME/.zprofile"
elif $IS_WSL; then
  link zsh/zprofile.wsl "$HOME/.zprofile"
fi
link sheldon "$HOME/.config/sheldon"

# --- git ---
link git/gitconfig "$HOME/.gitconfig"
if $IS_MAC; then
  link git/local.mac "$HOME/.local-gitconfig"
elif $IS_WSL; then
  link git/local.wsl "$HOME/.local-gitconfig"
fi

# --- tmux ---
link tmux/tmux.conf "$HOME/.tmux.conf"

# --- herdr (agent multiplexer; link the config file only — ~/.config/herdr/ also holds live sockets/logs) ---
link herdr/config.toml "$HOME/.config/herdr/config.toml"

# --- claude code (user-level config; the repo's own project .claude/ is separate) ---
# Prune first: a link this script USED to create keeps pointing into the repo after the source is
# renamed (the .sh → .ts hook migration left six dangling links under ~/.claude). Only symlinks
# INTO this repo that no longer resolve are removed — foreign or healthy links are untouched.
for _stale in "$HOME"/.claude/*; do
  [ -L "$_stale" ] || continue
  [ -e "$_stale" ] && continue
  case "$(readlink "$_stale")" in
    "$DOTFILES"/*) rm -f "$_stale" && echo "pruned (dangling): $_stale" ;;
  esac
done
unset _stale
link agents/claude/statusline-command.ts "$HOME/.claude/statusline-command.ts"
link agents/claude/hooks "$HOME/.claude/hooks"
link agents/claude/CLAUDE.md "$HOME/.claude/CLAUDE.md"
link agents/claude/settings.json "$HOME/.claude/settings.json"
link agents/claude/keybindings.json "$HOME/.claude/keybindings.json"

# --- cocoindex-code (MCP code search; declarative global settings = no interactive `ccc init`) ---
link cocoindex/global_settings.yml "$HOME/.cocoindex_code/global_settings.yml"

# --- topgrade (govern which update steps run; e.g. disable flutter/tlmgr) ---
link topgrade/topgrade.toml "$HOME/.config/topgrade.toml"

# --- lazygit (cross-OS topic; config dir differs by OS — lazygit honors XDG_CONFIG_HOME on both) ---
if $IS_MAC; then
  link lazygit/config.yml "$HOME/Library/Application Support/lazygit/config.yml"
elif $IS_WSL; then
  link lazygit/config.yml "$HOME/.config/lazygit/config.yml"
fi

# --- karabiner (macOS only; whole-dir replace, so guard the rm against repeat runs) ---
if $IS_MAC; then
  kdst="$HOME/.config/karabiner"
  if [[ -L $kdst && "$(readlink "$kdst")" == "$DOTFILES/karabiner" ]]; then
    : # already linked -> nothing to rm
  elif ! $FORCE && [[ -e $kdst && ! -L $kdst ]]; then
    echo "skip (exists, not symlink): $kdst" # safe (default): don't rm a real dir
  else
    rm -rf "$kdst"
    link karabiner "$kdst"
  fi
fi

# --- wsl (WSL2 system config; /etc needs root — guard sudo so pulls don't re-prompt) ---
if $IS_WSL; then
  if [[ "$(readlink /etc/wsl.conf 2> /dev/null)" == "$DOTFILES/wsl/wsl.conf" ]]; then
    : # already linked -> no sudo prompt
  elif sudo ln -sfn "$DOTFILES/wsl/wsl.conf" /etc/wsl.conf 2> /dev/null; then
    echo "linked: /etc/wsl.conf -> $DOTFILES/wsl/wsl.conf (sudo)"
  else
    echo "skip: /etc/wsl.conf needs root — run: sudo ln -sfn $DOTFILES/wsl/wsl.conf /etc/wsl.conf"
  fi
fi

if ! $IS_MAC && ! $IS_WSL; then
  echo "warn: neither macOS nor WSL detected — OS-specific links skipped" >&2
fi

echo "done."
