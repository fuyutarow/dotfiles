#!/bin/sh
curl -sL --proto-redir -all,https https://raw.githubusercontent.com/zplug/installer/master/installer.zsh | zsh
export ZPLUG_HOME=$HOME/.zplug
source $ZPLUG_HOME/init.zsh
source ~/.zshrc
zplug install
chmod -R 755 $ZPLUG_HOME
source ~/.zshrc
