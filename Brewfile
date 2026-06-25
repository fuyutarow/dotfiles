# Single source of truth for CLI tooling (macOS AND WSL/linuxbrew).
# Apply with: brew bundle --file=~/dotfiles/Brewfile
# Check with: mise run check-tools  (scripts/check-tools.sh)

# Core CLI tools
brew "bat"          # better cat (alias: p)
brew "coreutils"
brew "eza"          # better ls (l, ll, la)
brew "fd"           # better find (f)
brew "fnm"
brew "gh"
brew "git"
brew "git-delta"    # better diff
brew "jq"
brew "just"         # task runner (j)
brew "mise"
brew "ripgrep"      # better grep (gr)
brew "rm-improved"  # rip — the ONLY sanctioned file remover (rm is disabled)
brew "sheldon"
brew "tmux"
brew "topgrade"
brew "zoxide"       # better cd (,)
brew "bun"          # JS runtime + pkg manager (homebrew-core; no tap. `bun upgrade` self-updates too)

# Productivity / TUI
brew "atuin"        # shell history (Ctrl+R)
brew "lazygit"      # git TUI (lg)
brew "direnv"
brew "fzf"
brew "dust"         # better du (du2)
brew "procs"        # better ps
brew "btop"         # system monitor (tmux prefix+G popup)

# Linux-desktop clipboard backends for tmux (WSL uses clip.exe, mac uses pbcopy — neither needs these)
if OS.linux?
  brew "xclip"        # X11 clipboard
  brew "wl-clipboard" # Wayland clipboard (wl-copy/wl-paste)
end
brew "tldr"         # better man (h)
brew "yq"
brew "kondo"        # reclaims project build artifacts (node_modules/target/build…) — see `mise run cache:projects`

# TeX / LaTeX — base distribution differs by OS (see skill: compiling-latex → Environment).
#   mac:  mactex-no-gui cask  = full TeX Live, binaries via /Library/TeX/texbin; tlmgr needs sudo.
#   WSL:  texlive formula     = effectively full TeX Live (Japanese incl.), binaries already on PATH;
#         tlmgr is system-mode read-only → use `tlmgr --usermode install` for extras.
if OS.mac?
  cask "mactex-no-gui"
else
  brew "texlive"
end
brew "tex-fmt"      # Rust LaTeX formatter (NOT in TeX Live) — formula, bottles on both OSes
brew "rumdl"        # Rust Markdown linter+formatter ("ruff for markdown", markdownlint-compatible) — used by qoed `mise run lint:md`
brew "poppler"      # pdftoppm/pdfinfo — PDF→PNG visual verification
brew "biber"        # BibLaTeX backend — brew `texlive` bundles bibtex but NOT biber; match its version to TeX Live's biblatex
# Note: chktex DOES ship inside TeX Live (already on PATH) — do not add a separate formula for it.

# macOS-only GUI apps (skipped automatically on Linux/WSL)
if OS.mac?
  cask "iterm2"
  cask "karabiner-elements"
end
