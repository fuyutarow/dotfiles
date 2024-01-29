
install-brew:
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

install-rust:
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

link-dots:
    ls -A ${HOME}/dotfiles/dots | xargs -I {} ln -sfv ${HOME}/dotfiles/dots/{} ~

link-sheldon:
    ln -s ${HOME}/dotfiles/sheldon ${HOME}/.config

link-karabinar:
    ln -s ${HOME}/dotfiles/karabinar ${HOME}/.config/

install-cargo:
    cargo install sccache
    cargo install cargo-make cargo-edit
    cargo install nu
    cargo install zellij
