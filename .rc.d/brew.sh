#!/bin/bash

if [ -f ~/.env ]; then
  source <(sed -E -n 's/[^#]+/export &/ p' ~/.env)
  SHELL=$shell
  eval $($BREW_PATH/bin/brew shellenv)
elif type "コマンド" > /dev/null 2>&1; then
  eval $(brew shellenv)
fi

