# Set up the prompt
#autoload -Uz promptinit
#promptinit
#prompt adam1

setopt histignorealldups sharehistory

# Use emacs keybindings even if our EDITOR is set to vi
bindkey -e

# Keep 1000 lines of history within the shell and save it to ~/.zsh_history:
HISTSIZE=100000
SAVEHIST=100000
HISTFILE=~/.zsh_history

# Use modern completion system
autoload -Uz compinit
compinit
HISTSIZE=1000
SAVEHIST=1000
HISTFILE=~/.zsh_history

# Source aliases and other rcfiles.
if [ -f ~/.bash_aliases ]; then
    . ~/.bash_aliases
fi

if [ -d ~/.bashrc.d ]; then
    for file in $(/bin/ls ~/.bashrc.d/*.bashrc); do
        . $file;
    done
fi


export ZPLUG_HOME=$HOME/.zplug
source $ZPLUG_HOME/init.zsh

zplug 'zplug/zplug', hook-build:'zplug --self-manage'
zplug mafredri/zsh-async, from:github
zplug denysdovhan/spaceship-prompt, use:spaceship.zsh, from:github, as:theme
#zplug sindresorhus/pure, use:pure.zsh, from:github, as:theme
zplug "zsh-users/zsh-completions"

#zplug "modules/osx", from:prezto, if:"[[ $OSTYPE == *darwin* ]]"
#zplug "modules/prompt", from:prezto
#zstyle ':prezto:module:prompt' theme 'sorin'
#zstyle ':prezto:module:prompt' theme 'diggie'
#zstyle ':zplug' theme 'pure'
#zstyle ':zplug' theme 'spaceship'

zplug load --verbose
