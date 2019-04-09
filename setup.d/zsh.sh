#!/bin/sh
: ### install zsh
brew install zsh

: ### change default shell
which zsh | sudo tee -a /etc/shells > /dev/null
