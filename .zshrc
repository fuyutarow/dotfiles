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
#autoload -Uz compinit
#compinit

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
if [[ ! -d $ZPLUG_HOME ]];then
  git clone https://github.com/zplug/zplug $ZPLUG_HOME
fi
source $ZPLUG_HOME/init.zsh

#zplug 'zplug/zplug', hook-build:'zplug --self-manage'
zplug mafredri/zsh-async, from:github, lazy:true
zplug "zsh-users/zsh-completions", lazy:true # reinforce completions
zplug "modules/git", from:prezto, lazy:true # git completion
zplug "peterhurford/git-aliases.zsh", lazy:true # git aliases completion
zplug "zsh-users/zsh-autosuggestions", lazy:true # suggest in input


################################################################################
# Styple
################################################################################
#zplug denysdovhan/spaceship-prompt, use:spaceship.zsh, from:github, as:theme
#zplug sindresorhus/pure, use:pure.zsh, from:github, as:theme
zplug "modules/osx", from:prezto, if:"[[ $OSTYPE == *darwin* ]]"
zplug "modules/prompt", from:prezto
# zstyle は zplug load の前に設定する
zstyle ':prezto:module:prompt' theme 'giddie'


#if ! zplug check --verbose; then
#    printf "Install? [y/N]: "
#    if read -q; then
#        echo; zplug install
#    fi
#fi
#zplug load --verbose
zplug load
