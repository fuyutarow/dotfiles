#!/bin/zsh
: ### install zplug
curl -sL --proto-redir -all,https https://raw.githubusercontent.com/zplug/installer/master/installer.zsh | zsh
export ZPLUG_HOME=$HOME/.zplug
source $ZPLUG_HOME/init.zsh
zplug "sorin-ionescu/prezto"
zplug install
: ### install zprezto
ln -s $ZPLUG_HOME/repos/sorin-ionescu/prezto $HOME/.zprezto
setopt EXTENDED_GLOB
for rcfile in "${ZDOTDIR:-$HOME}"/.zprezto/runcoms/^README.md(.N); do
   ln -s "$rcfile" "${ZDOTDIR:-$HOME}/.${rcfile:t}"
done
