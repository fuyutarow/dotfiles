#!/bin/bash

case $(uname) in 
  "Linux")
    echo Linux
    sudo apt install -y build-essential curl file git
    sh -c "$(curl -fsSL https://raw.githubusercontent.com/Linuxbrew/install/master/install.sh)"
    eval $(/home/linuxbrew/.linuxbrew/bin/brew shellenv)
    ;;
  "Darwin")
    echo Darwin
    ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"
    ;;
  *)
    echo not supported OS
    ;;
esac
