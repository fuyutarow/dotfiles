# Dotfiles

Personal dotfiles with cross-platform support for macOS and WSL/Linux.

知者不惑，仁者不憂，勇者不懼。

## Architecture

```
dotfiles/
├── common/             # Shared configurations
│   ├── .zshrc          # Common zsh configuration
│   ├── .gitconfig      # Git configuration
│   ├── .tmux.conf      # Tmux configuration
│   ├── aliases.zsh     # Common aliases (including commad)
│   └── sheldon/        # Zsh plugin manager config
│       └── plugins.toml
├── wsl/                # WSL-specific configurations
│   ├── .zprofile       # WSL-specific PATH and environment
│   ├── .local-gitconfig # Local git config
│   └── justfile        # WSL setup tasks
├── karabiner/          # Karabiner-Elements config (macOS)
├── Brewfile            # Package list
├── justfile            # Main task runner
└── README.md           # This file
```

## Features

- **Cross-platform**: Seamless support for macOS and WSL/Linux
- **Modular**: Organized by purpose (common, OS-specific, apps)
- **Easy setup**: Single command installation
- **Modern tools**: Uses modern CLI replacements (eza, bat, ripgrep, etc.)

## Installation

### WSL Setup

1. Clone this repository:
```bash
git clone https://github.com/fuyutarow/dotfiles.git ~/dotfiles
cd ~/dotfiles
```

2. Run the WSL setup:
```bash
cd wsl
just init  # Full initial setup
# or
just link-dots  # Just link dotfiles
```

### Manual Installation

```sh
sudo apt update
sudo apt upgrade -y
sudo apt install -y build-essential curl file git pkg-config libssl-dev cmake clang
sudo apt install -y just zsh

cd ~
git clone https://github.com/fuyutarow/dotfiles
cd ~/dotfiles/wsl
just link-dots
just install-homebrew
zsh
eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"
brew install git sheldon topgrade
sheldon init
chsh -s $(which zsh) ;: Modify login shell

topgrade
cd ~/dotfiles
just install-rust
```

## What Gets Installed

### Common Tools (All Platforms)
- Shell: zsh with sheldon plugin manager
- Modern CLI tools: eza, bat, ripgrep, fd, delta, dust, procs
- Development: git, fnm (Node.js), bun, direnv
- Utilities: tmux, just, topgrade

### macOS-Specific
- Karabiner-Elements for keyboard customization
- macOS-specific GUI applications via Homebrew Cask

### WSL-Specific
- Integration with Windows clipboard (clip.exe)
- WSL-optimized configurations

## Customization

### Adding Common Aliases
Edit `common/aliases.zsh` to add aliases that work on all platforms.

### Adding OS-Specific Configuration
- For macOS: Add files to `os/macos/`
- For WSL: Add files to `os/wsl/`

### Adding New Applications
1. Create a directory under `apps/` for your application
2. Add your configuration files
3. Update `install.sh` to link your new configs

## Conventions

- All zsh files in `common/` and `os/*/` are automatically sourced
- OS detection is automatic based on system characteristics
- Symlinks are used for all configurations to keep everything in sync