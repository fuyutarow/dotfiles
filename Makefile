link :
	bash setup.d/lns.sh

add\:brew :
	bash setup.d/brew.sh

add\:dev :
	brew update
	brew install git exa fuyutarow/commad/commad lolcat colordiff

add\:zsh :
	bash setup.d/zsh.sh

add\:vim :
	brew install neovim
	bash setup.d/dein.sh
	ln -s ~/dotfiles/nvim ~/.config/nvim
	vi +":call dein#install()" +qa

add\:coc :
	vi +":CocInstall coc-rls" +qa ;: Rust
	vi +":CocInstall coc-python" +qa
	vi +":CocInstall coc-tsserver" +qa ;: TypeScript
	vi +":CocInstall coc-html" +qa
	vi +":CocInstall coc-css" +qa
	vi +":CocInstall coc-yaml" +qa
	vi +":CocInstall coc-vetur" +qa ;: Vue
	vi +":CocInstall coc-solargraph" +qa ;: Ruby

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

dd\:karabiner :
	ln -s ${PWD}/karabiner ~/.config/
