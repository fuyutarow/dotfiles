# Single source of truth for CLI tooling (macOS AND WSL/linuxbrew).
# Apply with: brew bundle --file=~/dotfiles/Brewfile
# Check with: mise run tools:audit  (scripts/check-tools.sh)
#
# The core dev utilities — what every machine gets, rented boxes included — live in Brewfile.core
# and are read in here first; this file adds what only the Mac and WSL carry. Until 2026-10-05 the
# core set was a `# @core` comment on lines here, which brew could not see and which went missing
# without any error (gh, topgrade). Brewfile is Ruby, so the split is one instance_eval line.
instance_eval(File.read(File.join(__dir__, "Brewfile.core")))

# Core CLI tools
brew "coreutils"
# fnm removed 2026-08-06 (INV-6): a second version manager that hooks every login shell is an
# implicit global toolchain. Node is declared per project in mise.toml, or it does not exist.
brew "git"
brew "fnox"        # secrets: one CLI over the macOS Keychain (mac) and age files (WSL); config is
                    # per machine in ~/.config/fnox/config.toml, never in this public repo
brew "age"         # fnox age provider (WSL has no Secret Service, so its secrets are age-encrypted)
brew "tmux"

# Linux-desktop clipboard backends for tmux (WSL uses clip.exe, mac uses pbcopy — neither needs these)
if OS.linux?
  brew "xclip"        # X11 clipboard
  brew "wl-clipboard" # Wayland clipboard (wl-copy/wl-paste)
  brew "bubblewrap"   # bwrap: grok --sandbox needs it on Linux (refuses to start without it)
end
brew "yq"
brew "kondo"        # reclaims project build artifacts (node_modules/target/build…) — see `mise run reclaim:pick`
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
brew "shellcheck"   # shell static-analysis linter (bash/sh; not zsh) — dotfiles `mise run lint:sh`
brew "poppler"      # pdftoppm/pdfinfo — PDF→PNG visual verification
brew "biber"        # BibLaTeX backend — brew `texlive` bundles bibtex but NOT biber; match its version to TeX Live's biblatex
# Note: chktex DOES ship inside TeX Live (already on PATH) — do not add a separate formula for it.

# macOS-only GUI apps (skipped automatically on Linux/WSL)
if OS.mac?
  cask "android-platform-tools" # adb/fastboot for android:line policy reproduction
  cask "iterm2"
  cask "karabiner-elements"
  # The editor `e`/`ee` open (zsh/aliases.zsh `editor()`), so it is a hard dependency, not taste.
  # WSL has no cask: there `code` is a symlink to the Windows VS Code WSL launcher, wired by
  # zsh/zprofile.wsl's _WIN_EXES allowlist — which is why check-tools.sh does not check `code`.
  cask "visual-studio-code"
  # agy (Antigravity CLI; aliases a / aa) is a core agent CLI. Linux gets it from scripts/linux-init.ts.
  cask "antigravity-cli"
  # Clipboard history (Cmd+B popup, paste-on-select). Its two defaults live in macos/defaults.ts.
  # Was an orphan ~/.config/mise/tasks/setup-maccy.sh (Apr 2026) outside this repo — folded in
  # 2026-09-11 so install has one home (here) and configuration has one home (defaults.ts).
  cask "maccy"
end
