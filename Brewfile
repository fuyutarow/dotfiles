# Single source of truth for CLI tooling (macOS AND WSL/linuxbrew).
# Apply with: brew bundle --file=~/dotfiles/Brewfile
# Check with: mise run check-tools  (scripts/check-tools.sh)

# Core CLI tools
brew "bat"          # better cat (alias: p)
brew "coreutils"
brew "eza"          # better ls (l, ll, la)
brew "fd"           # better find (f)
# fnm removed 2026-08-06 (INV-6): a second version manager that hooks every login shell is an
# implicit global toolchain. Node is declared per project in mise.toml, or it does not exist.
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
brew "herdr"        # agent multiplexer (tmux-like workspace for AI coding agents) — config in herdr/, cross-OS
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
brew "hunk"         # review-first terminal diff viewer for agent-authored changesets (alias: d)

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
brew "rumdl"        # Rust Markdown linter+formatter ("ruff for markdown", markdownlint-compatible) — dotfiles & qoed `mise run fmt:md`/`lint:md`
brew "shfmt"        # shell formatter (bash/POSIX/mksh; "gofmt for shell") — dotfiles `mise run fmt:sh`
brew "biome"        # Rust TS/JS/JSON formatter+linter ("the web toolchain") — dotfiles `mise run fmt:ts` (formatter only, house 2-space style pinned via CLI flags)
brew "shellcheck"   # shell static-analysis linter (bash/sh; not zsh) — dotfiles `mise run lint:sh`
brew "poppler"      # pdftoppm/pdfinfo — PDF→PNG visual verification
brew "biber"        # BibLaTeX backend — brew `texlive` bundles bibtex but NOT biber; match its version to TeX Live's biblatex
# Note: chktex DOES ship inside TeX Live (already on PATH) — do not add a separate formula for it.

# macOS-only GUI apps (skipped automatically on Linux/WSL)
if OS.mac?
  cask "iterm2"
  cask "karabiner-elements"
  # The editor `e`/`ee` open (zsh/aliases.zsh `editor()`), so it is a hard dependency, not taste.
  # WSL has no cask: there `code` is a symlink to the Windows VS Code WSL launcher, wired by
  # zsh/zprofile.wsl's _WIN_EXES allowlist — which is why check-tools.sh does not check `code`.
  cask "visual-studio-code"
end
