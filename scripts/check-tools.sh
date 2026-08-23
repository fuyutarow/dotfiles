#!/usr/bin/env bash
# Single source of truth for "is my CLI toolbox installed?" (macOS & WSL).
# Called by `mise run check:tools`.
# Install everything via: brew bundle --file=~/dotfiles/Brewfile
set -uo pipefail

# command[:install-hint] — keep in sync with Brewfile (that file is the installer)
TOOLS=(
  bat eza rg fd dust procs zoxide just fzf lazygit jq yq tldr
  atuin delta direnv rip sheldon tmux herdr gh mise topgrade bun kondo hunk
  # LaTeX toolchain (mactex-no-gui / texlive + tex-fmt + poppler)
  lualatex latexmk tlmgr chktex tex-fmt pdftoppm
  # Markdown lint+format (Rust; `mise run fmt:md` / `lint:md`)
  rumdl
  # Shell fmt+lint (`mise run f` / `lint`) — shfmt=bash formatter, shellcheck=bash linter (zsh gated by `zsh -n`)
  shfmt shellcheck
  # TS/JS fmt (`mise run fmt:ts`) — its absence used to fail the task with a bare
  # "xargs: biome: No such file or directory" instead of being caught by this check.
  biome
  # BibLaTeX backend (`compiling-latex`); system monitor (tmux prefix+shift+B popup)
  biber btop
)

missing=0
for tool in "${TOOLS[@]}"; do
  if command -v "$tool" > /dev/null 2>&1; then
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
