#!/bin/sh
: ### install zsh
brew install zsh

: ### change default shell
sudo chsh -s "$(command -v zsh)" "${USER}"

: ### install zplugin
sh -c "$(curl -fsSL https://raw.githubusercontent.com/zdharma/zplugin/master/doc/install.sh)"
brew install svn ;: for zplugin
