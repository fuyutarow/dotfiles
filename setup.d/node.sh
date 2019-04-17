#!/bin/sh
curl -L git.io/nodebrew | perl - setup
export PATH=$HOME/.nodebrew/current/bin:$PATH
nodebrew install latest
nodebrew use latest
npm install -g yarn
npm install -g ts-node typescript
