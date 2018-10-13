export LAZYENV=$HOME/.local/lazyenv
if [[ ! -f $LAZYENV/lazyenv.bash ]]; then
  git clone https://github.com/takezoh/lazyenv.git $LAZYENV
fi
source $LAZYENV/lazyenv.bash 
  
if [ -d ~/.env.d ]; then
    for file in $(/bin/ls ~/.env.d/*.env); do
        . $file;
    done
fi

#if type figlet > /dev/null 2>&1; then
#  :
#else
#  alias figlet='echo'
#fi
#
#
#
#_tiv_init() {
#	if type tiv > /dev/null 2>&1; then
#		:
#	else
#		git clone https://github.com/stefanhaustein/TerminalImageViewer.git $HOME/.tmp
#		cd $HOME/.tmp/TerminalImageViewer/src/main/cpp
#		make
#		sudo make install
#	fi
#}
#eval "$(lazyenv.load _tiv_init tiv)"
#
#if type fortune > /dev/null 2>&1; then
#  if type pokemonsay > /dev/null 2>&1; then
#    fortune | pokemonsay --think
#  fi
#fi
