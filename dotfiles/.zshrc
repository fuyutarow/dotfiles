# # start time
# zmodload zsh/zprof && zprof

# Use emacs keybindings even if our EDITOR is set to vi
bindkey -e

# aliases
# =======
if [ -f ~/.aliases ]; then
    . ~/.aliases
fi

# plugin manager
# ==============
# Use Zplugin
source $HOME/.zplugin/bin/zplugin.zsh
autoload -Uz _zplugin
(( ${+_comps} )) && _comps[zplugin]=_zplugin


if [ -d ~/.zshrc.d ]; then
    for file in $(/bin/ls ~/.zshrc.d/*); do
        . $file;
    done
fi

# locale
# ======
# Fix bug caused by oh-my-zsh
export LC_ALL=en_US.UTF-8
export LANG=en_US.UTF-8


# environment variables
# =====================
if [ -d ~/.env.d ]; then
    for file in $(/bin/ls ~/.env.d/*); do
        . $file;
    done
fi

# # stop time
# if (which zprof > /dev/null 2>&1) ;then
#   zprof
# fi
