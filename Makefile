link :
	bash setup.d/lns.sh

add\:brew :
	bash setup.d/brew.sh

add\:zsh :
	bash setup.d/zsh.sh

add\:vim :
	brew install neovim
	bash setup.d/dein.sh
	ln -s ~/dotfiles/nvim ~/.config/nvim
	vi +":call dein#install()" +qa
	vi +":CocInstall coc-rls" +qa
	vi +":CocInstall coc-python" +qa

add\:rust :
	curl https://sh.rustup.rs -sSf | sh
	rustup update
	rustup component add rls rust-analysis rust-src ;: LPS

add\:python :
	brew install pyenv pipenv

add\:node :
	. setup.d/node.sh
