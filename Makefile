add\:vim :
	brew install neovim
	bash setup.d/dein.sh
	ln -s ~/dotfiles/nvim ~/.config/nvim

add\:rust :
	rustup update
	rustup component add rls rust-analysis rust-src ;: LPS
	vi +":CocInstall coc-rls" +qall

add\:python :
	brew install pyenv pipenv
	pyenv
	vi +":CocInstall coc-python" +qall
