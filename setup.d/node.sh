#!/bin/sh
curl -L git.io/nodebrew | perl - setup
export PATH=$HOME/.nodebrew/current/bin:$PATH
npm install -g ts-node typescript
