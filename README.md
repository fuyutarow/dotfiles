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
git clone https://github.com/fuyutarow/dotfiles.git ~/dotfiles
cd ~/dotfiles/wsl && just init
exec zsh
```
