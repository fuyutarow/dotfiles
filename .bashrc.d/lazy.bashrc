if [ -f $HOME/.local/lazyenv/lazyenv.bash ]; then
  source $HOME/.local/lazyenv/lazyenv.bash 
else
  git clone https://github.com/takezoh/lazyenv.git $HOME/.local/lazyenv
  source $HOME/.local/lazyenv/lazyenv.bash 
fi

if type figlet > /dev/null 2>&1; then
  :
else
  alias figlet='echo'
fi

_nvmenv_init() {
  echo 'loading...'
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"  # This loads nvm
  [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
  figlet 'NVM'
}
eval "$(lazyenv.load _nvmenv_init nvm node npm yarn parcel esformatter)"

_goenv_init() {
  echo 'loading...'
  export GOPATH=$HOME/.local/go
  export PATH=$GOPATH/bin:$PATH
  figlet 'GO'
}
eval "$(lazyenv.load _goenv_init go)"

_python_init() {
  figlet 'Python on Anaconda'
}
eval "$(lazyenv.load _python_init python ipython jupyter pip)"

_rust_init() {
  figlet 'Rust'
  if [ -e ~/.cargo/env ]; then
    :
  else
    curl https://sh.rustup.rs -sSf | sh
  fi
  source $HOME/.cargo/env
}
eval "$(lazyenv.load _rust_init rust cargo rustc rustup)"

_julia_init() {
  if [ -e ~/.local/bin/julia-pkg ]; then
    :
  else
    PKG_PATH=$HOME/.tmp/julia-pkg
    git clone https://github.com/fytroo/julia-pkg.git $PKG_PATH
    cd $PKG_PATH 
    ./install_rust.sh
    ./install.sh --prefix $HOME/.local
    make install prefix=$HOME/.local
  fi
}
eval "$(lazyenv.load _julia_init julia julia-pkg jip)"



_tiv_init() {
	if type tiv > /dev/null 2>&1; then
		:
	else
		git clone https://github.com/stefanhaustein/TerminalImageViewer.git $HOME/.tmp
		cd $HOME/.tmp/TerminalImageViewer/src/main/cpp
		make
		sudo make install
	fi
}
eval "$(lazyenv.load _tiv_init tiv)"

if type fortune > /dev/null 2>&1; then
  if type pokemonsay > /dev/null 2>&1; then
    fortune | pokemonsay --think
  fi
fi
