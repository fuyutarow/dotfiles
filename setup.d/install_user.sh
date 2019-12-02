#!/bin/bash


git clone https://github.com/Homebrew/brew ~/.linuxbrew/Homebrew
mkdir ~/.linuxbrew/bin
ln -s ../Homebrew/bin/brew ~/.linuxbrew/bin

SHELL=bash
eval $(~/.linuxbrew/bin/brew shellenv)


bash setup.d/zsh.sh
