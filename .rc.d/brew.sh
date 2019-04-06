#!/bin/bash

case $(uname) in 
  "Linux")
    eval $(/home/linuxbrew/.linuxbrew/bin/brew shellenv)
    ;;
  "Darwin")
    ;;
  *)
    echo not supported OS
    ;;
esac
