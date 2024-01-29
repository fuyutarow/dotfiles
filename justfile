
install-homebrew:
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

install-rust:
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

link-dots:
    ls -A ${HOME}/dotfiles/dots | xargs -I {} ln -sfv ${HOME}/dotfiles/dots/{} ~


improve-mac: speed-up-key-repeat hide-inactive-apps show-dots

# Make it so that the key repeat is faster
speed-up-key-repeat:
    defaults write -g InitialKeyRepeat -int 20
    defaults write -g KeyRepeat -int 3
    defaults read -g InitialKeyRepeat
    defaults read -g KeyRepeat

# Hide inactive apps from the dock
hide-inactive-apps:
    defaults write com.apple.dock static-only -boolean true
    killall Dock

# Make it so that dot files is on the left side of the screen
show-dots:
    defaults write com.apple.finder AppleShowAllFiles TRUE
    killall Finder


link-sheldon:
    ln -s ${HOME}/dotfiles/sheldon ${HOME}/.config

link-karabiner:
    ln -s ${HOME}/dotfiles/karabiner ${HOME}/.config


install-brew:
    brew install git cmake pkg-config ;: core development tools
    brew install sheldon ;: package manager for shell
    brew install sshuttle
    brew install exa bat rm-improved ripgrep ;: better cli
    brew install karabiner-elements ;: keyboard remapping
    brew install zoom slack discord telegram ;: communication
    brew install iterm2
    brew install tmux
    brew install visual-studio-code homebrew/cask-versions/visual-studio-code-insiders ;: editors
    brew install microsoft-edge google-chrome chromium firefox opera ;: browsers
    brew install yippy alt-tab resolutionator ;: window management
    brew install deepl
    brew install topgrade ;: update all the things
    brew install fnm bun ;: for node

install-cargo:
    cargo install sccache
    cargo install cargo-make cargo-edit
    cargo install nu
    cargo install zellij
