# Dotfiles

知者不惑，仁者不憂，勇者不懼。

## Setup

### macOS

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
git clone https://github.com/fuyutarow/dotfiles.git ~/dotfiles
cd ~/dotfiles && brew install mise && mise run mac:init
exec zsh
```

### WSL

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"
git clone https://github.com/fuyutarow/dotfiles.git ~/dotfiles
cd ~/dotfiles && brew install mise && mise run wsl:init
exec zsh
```

## Tasks

All repo tasks are defined in `mise.toml` (single task runner — no justfile here):

```bash
mise tasks            # list
mise run up           # update everything (topgrade)
mise run link-dots    # (re)create symlinks   — scripts/link-dots.sh
mise run check-tools  # check CLI toolbox     — scripts/check-tools.sh
mise run install:tools  # install toolbox     — Brewfile
```
