#!/bin/sh
brew install texlive
tlmgr option repository http://mirror.ctan.org/systems/texlive/tlnet
tlmgr update --self --all
