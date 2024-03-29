# Fig pre block. Keep at the top of this file.
. "$HOME/.fig/shell/zshrc.pre.zsh"
# # start time
# zmodload zsh/zprof && zprof

# Use emacs keybindings even if our EDITOR is set to vi
bindkey -e

eval "$(sheldon source)"

source $HOME/.config/env-make/env/*

# # environment variables
# # =====================
# if [ -d ~/.env.d ]; then
#     for file in $(/bin/ls ~/.env.d/*); do
#         . $file;
#     done
# fi

# export PATH=$HOME/.local/bin:$PATH

# # aliases
# # =======
# if [ -f ~/.aliases ]; then
#     . ~/.aliases
# fi

# locale
# ======
# Fix bug caused by oh-my-zsh
export LC_ALL=en_US.UTF-8
export LANG=en_US.UTF-8

# # stop time
# if (which zprof > /dev/null 2>&1) ;then
#   zprof
# fi

# ### Added by Zinit's installer
# if [[ ! -f $HOME/.zinit/bin/zinit.zsh ]]; then
#     print -P "%F{33}▓▒░ %F{220}Installing DHARMA Initiative Plugin Manager (zdharma/zinit)…%f"
#     command mkdir -p $HOME/.zinit
#     command git clone https://github.com/zdharma/zinit $HOME/.zinit/bin && \
#         print -P "%F{33}▓▒░ %F{34}Installation successful.%f" || \
#         print -P "%F{160}▓▒░ The clone has failed.%f"
# fi
# source "$HOME/.zinit/bin/zinit.zsh"
# autoload -Uz _zinit
# (( ${+_comps} )) && _comps[zinit]=_zinit
# ### End of Zinit installer's chunk

# plugin manager
# ==============
# Use Zplugin
# source $HOME/.zplugin/bin/zplugin.zsh
# autoload -Uz _zplugin
# (( ${+_comps} )) && _comps[zplugin]=_zplugin

if [ -d ~/.zshrc.d ]; then
    for file in $(/bin/ls ~/.zshrc.d/*); do
        . $file
    done
fi

# Created by `userpath` on 2020-01-24 01:45:05
export PATH="$PATH:/home/fuyutarow/.local/bin"
### End of Zinit's installer chunk

# Created by `userpath` on 2020-05-26 17:52:27
export PATH="$PATH:/mnt/c/Users/fuyutarow/WSL/.local/bin"

source ~/.config/env-make/.zshrc
eval "$(fnm env)"
export PYENV_ROOT="$HOME/.pyenv"
export PATH="$PYENV_ROOT/shims:$PATH"
eval "$(pyenv init -)"
# The next line updates PATH for the Google Cloud SDK.
if [ -f '/home/fuyutarow/google-cloud-sdk/path.zsh.inc' ]; then . '/home/fuyutarow/google-cloud-sdk/path.zsh.inc'; fi

# The next line enables shell command completion for gcloud.
if [ -f '/home/fuyutarow/google-cloud-sdk/completion.zsh.inc' ]; then . '/home/fuyutarow/google-cloud-sdk/completion.zsh.inc'; fi

# Fig post block. Keep at the bottom of this file.
. "$HOME/.fig/shell/zshrc.post.zsh"

#[ -f "/Users/fuyutarow/.ghcup/env" ] && source "/Users/fuyutarow/.ghcup/env" # ghcup-env
#[ -f "/Users/fuyutarow/.ghcup/env" ] && source "/Users/fuyutarow/.ghcup/env" # ghcup-env
#[ -f "/Users/fuyutarow/.ghcup/env" ] && source "/Users/fuyutarow/.ghcup/env" # ghcup-env
#[ -f "/Users/fuyutarow/.ghcup/env" ] && source "/Users/fuyutarow/.ghcup/env" # ghcup-env
[ -f "/Users/fuyutarow/.ghcup/env" ] && source "/Users/fuyutarow/.ghcup/env" # ghcup-env
