curdir := $(CURDIR)

link :
	@ls -A $(curdir)/dotfiles | xargs -I {} ln -sfv $(curdir)/dotfiles/{} ~

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
	sudo chsh -s "$(command -v zsh)" "${USER}"

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

add\:julia :
	wget https://julialang-s3.julialang.org/bin/linux/x64/1.3/julia-1.3.0-linux-x86_64.tar.gz -O julia.tar.gz
	mkdir ~/.julia
	tar zxvf julia.tar.gz -C ~/.julia --strip-components 1
	julia -e 'import Pkg; Pkg.add("jlpkg")'
	julia -e 'import jlpkg; jlpkg.install()'
	echo ~/.env.d/julia.sh

add\:shc :
	. setup.d/shc.sh

add\:v :
	. setup.d/v.sh

add\:karabiner :
	ln -s ${PWD}/karabiner ~/.config/

i1:
	git clone https://github.com/Ikuyadeu/review_pattern_gen.git
	cd review_pattern_gen
	pip install antlr4-python3-runtime unidiff gitpython
	git clone https://github.com/Ikuyadeu/CodeTokenizer.git

add\:haskell :
	. setup.d/haskell.sh
	stack exec jupyter -- notebook
