link :
	bash setup.d/lns.sh

add\:brew :
	bash setup.d/brew.sh

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
	rustup update
	rustup component add rls rust-analysis rust-src ;: LPS

add\:python :
	brew install pyenv pipenv

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
