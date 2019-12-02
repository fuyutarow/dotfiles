#!/bin/bash


git clone https://github.com/Homebrew/brew ~/.linuxbrew/Homebrew
mkdir ~/.linuxbrew/bin
ln -s ../Homebrew/bin/brew ~/.linuxbrew/bin

SHELL=bash
eval $(~/.linuxbrew/bin/brew shellenv)

brew install zsh

: ### install zplugin
sh -c "$(curl -fsSL https://raw.githubusercontent.com/zdharma/zplugin/master/doc/install.sh)"
brew install svn ;: for zplugin
zsh
