
install-homebrew:
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

install-rust:
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

link-dots:
    ls -A ${HOME}/dotfiles/dots | xargs -I {} ln -sfv ${HOME}/dotfiles/dots/{} ~


link-sheldon:
    ln -s ${HOME}/dotfiles/sheldon ${HOME}/.config

link-karabiner:
    ln -s ${HOME}/dotfiles/karabiner ${HOME}/.config


install-brew:
    brew install karabiner-elements
    brew install zoom slack discord telegram
    brew install iterm2
    brew install tmux
    brew install visual-studio-code homebrew/cask-versions/visual-studio-code-insiders
    brew install microsoft-edge google-chrome chromium firefox opera
    brew install yippy alt-tab
    brew install deepl
    brew install resolutionator
    brew install topgrade
    brew install sheldon
    brew install fnm
    brew install exa bat rm-improved ripgrep

install-cargo:
    cargo install sccache
    cargo install cargo-make cargo-edit
    cargo install nu
    cargo install zellij
