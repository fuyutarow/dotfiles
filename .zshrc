# Set up the prompt
#autoload -Uz promptinit
#promptinit
#prompt adam1

# Use emacs keybindings even if our EDITOR is set to vi
bindkey -e

################################################################################
# Source aliases and other rcfiles.
################################################################################
if [ -f ~/.aliases ]; then
    . ~/.aliases
fi


################################################################################
# Source any envs
################################################################################
export LAZYENV=$HOME/.local/lazyenv

if [[ ! -f $LAZYENV/lazyenv.bash ]]; then
  git clone https://github.com/takezoh/lazyenv.git $LAZYENV
fi

source $LAZYENV/lazyenv.bash 
  
if [ -d ~/.env.d ]; then
    for file in $(/bin/ls ~/.env.d/*); do
        . $file;
    done
fi

if [ -d ~/.rc.d ]; then
    for file in $(/bin/ls ~/.rc.d/*); do
        . $file;
    done
fi
################################################################################
# Zplug
################################################################################
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
export SAGE_ROOT=/Applications/SageMath-8.5.app/Contents/Resources/sage
PATH=$PATH:${SAGE_ROOT}
