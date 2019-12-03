# ~/.bashrc: executed by bash(0) for non-login shells.
# see /usr/share/doc/bash/examples/startup-files (in the package bash-doc)
# for examples

# If not running interactively, don't do anything
case $- in
    *i*) ;;
      *) return;;
esac

# don't put duplicate lines or lines starting with space in the history.
# See bash(1) for more options
HISTCONTROL=ignoreboth

# append to the history file, don't overwrite it
shopt -s histappend

# for setting history length see HISTSIZE and HISTFILESIZE in bash(1)
HISTSIZE=1000
HISTFILESIZE=2000

# check the window size after each command and, if necessary,
# update the values of LINES and COLUMNS.
shopt -s checkwinsize

# If set, the pattern "**" used in a pathname expansion context will
# match all files and zero or more directories and subdirectories.
#shopt -s globstar

# make less more friendly for non-text input files, see lesspipe(1)
[ -x /usr/bin/lesspipe ] && eval "$(SHELL=/bin/sh lesspipe)"

# set variable identifying the chroot you work in (used in the prompt below)
if [ -z "${debian_chroot:-}" ] && [ -r /etc/debian_chroot ]; then
    debian_chroot=$(cat /etc/debian_chroot)
fi

# set a fancy prompt (non-color, unless we know we "want" color)
case "$TERM" in
    xterm-color|*-256color) color_prompt=yes;;
esac

# uncomment for a colored prompt, if the terminal has the capability; turned
# off by default to not distract the user: the focus in a terminal window
# should be on the output of commands, not on the prompt
#force_color_prompt=yes

if [ -n "$force_color_prompt" ]; then
    if [ -x /usr/bin/tput ] && tput setaf 1 >&/dev/null; then
	# We have color support; assume it's compliant with Ecma-48
	# (ISO/IEC-6429). (Lack of such support is extremely rare, and such
	# a case would tend to support setf rather than setaf.)
	color_prompt=yes
    else
	color_prompt=
    fi
fi

if [ "$color_prompt" = yes ]; then
    PS1='${debian_chroot:+($debian_chroot)}\[\033[01;32m\]\u@\h\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\]\$ '
else
    PS1='${debian_chroot:+($debian_chroot)}\u@\h:\w\$ '
fi
unset color_prompt force_color_prompt

# If this is an xterm set the title to user@host:dir
case "$TERM" in
xterm*|rxvt*)
    PS1="\[\e]0;${debian_chroot:+($debian_chroot)}\u@\h: \w\a\]$PS1"
    ;;
*)
    ;;
esac

export PYSH=$HOME/.pyscript
alias fc='python $PYSH/fc.py -r'

# Add an "alert" alias for long running commands.  Use like so:
#   sleep 10; alert
alias alert='notify-send --urgency=low -i "$([ $? = 0 ] && echo terminal || echo error)" "$(history|tail -n1|sed -e '\''s/^\s*[0-9]\+\s*//;s/[;&|]\s*alert$//'\'')"'

# Alias definitions.
# You may want to put all your additions into a separate file like
# ~/.bash_aliases, instead of adding them here directly.
# See /usr/share/doc/bash-doc/examples in the bash-doc package.

export PATH=$HOME/.local/bin:$PATH

# Source aliases and other rcfiles.
if [ -f ~/.aliases ]; then
    . ~/.aliases
fi

# Source any envs.
if [ -f ~/.env.d/index.sh ]; then
    . ~/.env.d/index.sh
fi

# enable programmable completion features (you don't need to enable
# this, if it's already enabled in /etc/bash.bashrc and /etc/profile
# sources /etc/bash.bashrc).
if ! shopt -oq posix; then
  if [ -f /usr/share/bash-completion/bash_completion ]; then
    . /usr/share/bash-completion/bash_completion
  elif [ -f /etc/bash_completion ]; then
    . /etc/bash_completion
  fi
fi

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

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion ] ]
