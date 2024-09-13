<!-- ## Require
- macOS
- [Karabiner](https://pqrs.org/osx/karabiner/) -->


知者不惑，仁者不憂，勇者不懼。

## WSL

```sh
sudo apt update
sudo apt upgrade -y
sudo apt install -y build-essential curl file git pkg-config libssl-dev cmake
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

cd ~/dotfiles
just install-rust
```