# zmodload zsh/zprof && zprof

# Use emacs keybindings even if our EDITOR is set to vi
bindkey -e

if [ -f ~/.aliases ]; then
    . ~/.aliases
fi

### Added by Zplugin's installer
source '/Users/fuyutarow/.zplugin/bin/zplugin.zsh'
autoload -Uz _zplugin
(( ${+_comps} )) && _comps[zplugin]=_zplugin
### End of Zplugin's installer chunk

if [ -d ~/.zshrc.d ]; then
    for file in $(/bin/ls ~/.zshrc.d/*); do
        . $file;
    done
fi

export LC_ALL=en_US.UTF-8
export LANG=en_US.UTF-8

if [ -d ~/.env.d ]; then
    for file in $(/bin/ls ~/.env.d/*); do
        . $file;
    done
fi

# if (which zprof > /dev/null 2>&1) ;then
#   zprof
# fi
