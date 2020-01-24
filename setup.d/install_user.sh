#!/bin/bash

function rcfile () {
 case "${SHELL##*/}" in
   "bash" ) echo bashrc ;;
   "zsh" ) echo zshrc ;;
   "csh" ) echo cshrc ;;
   "tcsh" ) echo tcshrc ;;
   "*" ) echo
 esac
}

git clone https://github.com/fuyutarow/dotfiles ~/dotfiles
cd $_

make link

git clone https://github.com/Homebrew/brew ~/.linuxbrew/Homebrew
mkdir ~/.linuxbrew/bin
ln -s ../Homebrew/bin/brew ~/.linuxbrew/bin
echo "$(~/.linuxbrew/bin/brew shellenv)" >> ~/.$(rcfile)

SHELL=bash
eval $(~/.linuxbrew/bin/brew shellenv)

bash setup.d/zsh.sh
zsh
