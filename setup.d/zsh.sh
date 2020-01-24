#!/bin/sh
: ### install zsh
brew install zsh

: ### install zplugin
sh -c "$(curl -fsSL https://raw.githubusercontent.com/zdharma/zplugin/master/doc/install.sh)"
brew install svn ;: for zplugin
