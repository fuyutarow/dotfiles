#!/usr/bin/env bash
# Single source of truth for "is my CLI toolbox installed?" (macOS & WSL).
# Called by `mise run check-tools`.
# Install everything via: brew bundle --file=~/dotfiles/Brewfile
set -uo pipefail

# command[:install-hint] — keep in sync with Brewfile (that file is the installer)
TOOLS=(
  bat eza rg fd dust procs zoxide just fzf lazygit jq yq tldr
  atuin delta direnv rip sheldon tmux gh mise topgrade fnm bun kondo
  # LaTeX toolchain (mactex-no-gui / texlive + tex-fmt + poppler)
  lualatex latexmk tlmgr chktex tex-fmt pdftoppm
)

missing=0
for tool in "${TOOLS[@]}"; do
  if command -v "$tool" >/dev/null 2>&1; then
    echo "✅ $tool"
  else
    echo "❌ $tool"
    missing=$((missing + 1))
  fi
done

echo "---"
if [[ $missing -eq 0 ]]; then
  echo "All tools installed."
else
  echo "$missing missing — run: brew bundle --file=~/dotfiles/Brewfile"
fi
