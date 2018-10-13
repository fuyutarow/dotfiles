# Set up the prompt
#autoload -Uz promptinit
#promptinit
#prompt adam1

# Use emacs keybindings even if our EDITOR is set to vi
bindkey -e

# Source aliases and other rcfiles.
if [ -f ~/.bash_aliases ]; then
    . ~/.bash_aliases
fi

# Source any envs.
if [ -f ~/.env.d/index.sh ]; then
    . ~/.env.d/index.sh
fi

# Zplug
export ZPLUG_HOME=$HOME/.zplug
if [[ ! -d $ZPLUG_HOME ]];then
    git clone https://github.com/zplug/zplug $ZPLUG_HOME
fi
source $ZPLUG_HOME/init.zsh

if [ -d ~/.zshrc.d ]; then
    for file in $(/bin/ls ~/.zshrc.d/*); do
        . $file;
    done
fi

#zplug load --verbose
zplug load
