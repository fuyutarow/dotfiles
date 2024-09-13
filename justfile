install-rust:
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

install-conda:
    mkdir -p ~/miniconda3
    wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh -O ~/miniconda3/miniconda.sh
    bash ~/miniconda3/miniconda.sh -b -u -p ~/.config/conda

install-mamba:
    brew install micromamba
    source <(micromamba shell hook --shell zsh)
    micromamba config append channels conda-forge

install-brew:
    brew install git cmake pkg-config ;: core development tools
    brew install sheldon ;: package manager for shell
    brew install sshuttle
    brew install eza bat rm-improved ripgrep ;: better cli
    brew install karabiner-elements ;: keyboard remapping
    brew install zoom slack discord telegram ;: communication
    brew install iterm2
    brew install tmux
    brew install visual-studio-code homebrew/cask-versions/visual-studio-code-insiders ;: editors
    brew install microsoft-edge google-chrome chromium arc firefox opera brave-browser vivaldi ;: browsers
    brew install yippy alt-tab resolutionator ;: window management
    brew install deepl
    brew install topgrade ;: update all the things
    brew install fnm oven-sh/bun/bun ;: for node
    brew install figma
    brew install rye
    brew insatll gibo
    brew install box-tools


install-cargo:
    cargo install sccache
    cargo install cargo-make cargo-edit cargo-update
    cargo install nu
    cargo install zellij

# improve-mac: speed-up-key-repeat hide-inactive-apps show-dots

# # Make it so that the key repeat is faster
# speed-up-key-repeat:
#     defaults write -g InitialKeyRepeat -int 20
#     defaults write -g KeyRepeat -int 3
#     defaults read -g InitialKeyRepeat
#     defaults read -g KeyRepeat

# # Hide inactive apps from the dock
# hide-inactive-apps:
#     defaults write com.apple.dock static-only -boolean true
#     killall Dock

# # Make it so that dot files is on the left side of the screen
# show-dots:
#     defaults write com.apple.finder AppleShowAllFiles TRUE
#     killall Finder


# link-karabiner:
#     ln -s ${HOME}/dotfiles/karabiner ${HOME}/.config
