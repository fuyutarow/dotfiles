# Single source of truth for CLI tooling (macOS AND WSL/linuxbrew).
# Apply with: brew bundle --file=~/dotfiles/Brewfile
# Check with: mise run check-tools  (scripts/check-tools.sh)
tap "oven-sh/bun"

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
brew "oven-sh/bun/bun"

# Productivity / TUI
brew "atuin"        # shell history (Ctrl+R)
brew "lazygit"      # git TUI (lg)
brew "direnv"
brew "fzf"
brew "dust"         # better du (du2)
brew "procs"        # better ps
brew "tldr"         # better man (h)
brew "yq"

# macOS-only GUI apps (skipped automatically on Linux/WSL)
if OS.mac?
  cask "iterm2"
  cask "karabiner-elements"
end
