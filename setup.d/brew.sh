#!/bin/bash

SHELL=zsh
case $(uname) in 
  "Linux")
    echo Linux
    sudo apt install -y build-essential curl file git
    sh -c "$(curl -fsSL https://raw.githubusercontent.com/Linuxbrew/install/master/install.sh)"
    # eval $(/home/linuxbrew/.linuxbrew/bin/brew shellenv)
    eval $(${HOME}/.linuxbrew/bin/brew shellenv)

    # git clone https://github.com/Homebrew/brew ~/.linuxbrew/Homebrew
    # mkdir ~/.linuxbrew/bin
    # ln -s ../Homebrew/bin/brew ~/.linuxbrew/bin
    # eval $(~/.linuxbrew/bin/brew shellenv)
    ;;
  "Darwin")
    echo Darwin
    ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"
    ;;
  *)
    echo not supported OS
    ;;
esac
