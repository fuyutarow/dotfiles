# emacs like keybind
bindkey -e
autoload -U compinit
compinit

# auto-change capital letter to small letter
zstyle ':completion:*' matcher-list 'm:{a-z}={A-Z}'
# auto-complete
setopt auto_cd
setopt auto_pushd
setopt correct
setopt list_packed
setopt nolistbeep

setopt HIST_IGNORE_ALL_DUPS
setopt EXTENDED_HISTORY
setopt NO_HUP

setopt no_nomatch

#autoload predict-on
##predict-on

# PROMPT
PROMPT="$ "
RPROMPT="%~"
SPROMPT="correct: %R -> %r ? "
PROMPT2="# "
SPROMPT="zsh: %r is correct? [n,y,a,e]: "

zstyle ':completion:*' list-colors ${(s.:.)LS_COLORS}
# History Size
HISTFILE=~/.zsh_history
HISTSIZE=10000
SAVEHIST=10000
# #setopt hist_ignore_dups     # ignore duplication command history list
# #setopt share_history        # share command history data


autoload -U colors; colors

function rprompt-git-current-branch {
        local name st color

        if [[ "$PWD" =~ '/\.git(/.*)?$' ]]; then
                return
        fi
        name=$(basename "`git symbolic-ref HEAD 2> /dev/null`")
        if [[ -z $name ]]; then
                return
        fi
        st=`git status 2> /dev/null`
        if [[ -n `echo "$st" | grep "^nothing to"` ]]; then
                color=${fg[green]}
        elif [[ -n `echo "$st" | grep "^nothing added"` ]]; then
                color=${fg[yellow]}
        elif [[ -n `echo "$st" | grep "^# Untracked"` ]]; then
                color=${fg_bold[red]}
        else
                color=${fg[red]}
        fi

        echo "%{$color%}$name%{$reset_color%} "
}
setopt prompt_subst

RPROMPT='[`rprompt-git-current-branch`%~]'


# alias
export LSCOLORS=Cxgxcxdxbxegedabagacad
export LS_COLORS='di=34:ln=35:so=32:pi=33:ex=31:bd=46;34:cd=43;34:su=41;30:sg=46;30:tw=42;30:ow=43;30'

alias l="ls"
alias gist="git status"

# alias ls='ls -G -w'
alias ls='ls --color'
alias gls="gls --color"
alias la="ls -la"
alias lg="ls -g"
alias ll="ls -l"

 
if [ -f ~/.bash_aliases ]; then
    . ~/.bash_aliases
fi

if [ -d ~/.bashrc.d ]; then
    for file in $(/bin/ls ~/.bashrc.d/*.bashrc); do
        . $file;
    done
fi

#
# added by Miniconda3 installer
export PATH="/home/yufukuda/.anaconda3/bin:$PATH"

# for pipenv
export PIPENV_VENV_IN_PROJECT=true

# NVM
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
export PATH="$PATH:`yarn global bin`"
