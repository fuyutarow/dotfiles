link :
	bash setup.d/lns.sh

add\:brew :
	bash setup.d/brew.sh

up\:brew:
	brew update
	brew upgrade
	brew cleanup

add\:dev :
	brew update
	brew install git exa fuyutarow/commad/commad lolcat colordiff mdr

add\:zsh :
	bash setup.d/zsh.sh

add\:vim :
	brew install neovim
	bash setup.d/dein.sh
	ln -s ~/dotfiles/nvim ~/.config/nvim
	vi +":call dein#install()" +qa

add\:coc :
	. setup.d/coc.sh

add\:rust :
	curl https://sh.rustup.rs -sSf | sh

rm\:rust :
	rustup self uninstall

up\:rust :
	rustup update
	rustup component add rls rust-analysis rust-src ;: LPS
	rustup component add clippy
	cargo install cargo-edit ;: subcommand `add`, `rm`, `upgrade`
	cargo install --force cargo-make

add\:jupyter\:rust:
	cargo install evcxr_jupyter
	evcxr_jupyter --install
	jupyter kernelspec list

add\:wasm :
	rustup update
	rustup target add wasm32-unknown-unknown --toolchain nightly
	cargo install wasm-pack

new\:wasm :
	. new/wasm.sh

add\:python :
	brew install pyenv pipenv

up\:pip:
	pip install -Ur setup.d/requirements.txt

add\:jupyter :
	bash setup.d/jupyter.sh

add\:node :
	. setup.d/node.sh

add\:shc :
	. setup.d/shc.sh

add\:v :
	. setup.d/v.sh

add\:karabiner :
	ln -s ${PWD}/karabiner ~/.config/

add\:haskell :
	. setup.d/haskell.sh
	stack exec jupyter -- notebook
