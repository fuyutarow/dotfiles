echo "[DEBUG] Starting .zshrc"

#zplug sindresorhus/pure, use:pure.zsh, from:github, as:theme
echo "[DEBUG] Setting up theme based on HOST: $HOST"
case "$HOST" in
"tomatowk")
  zplug denysdovhan/spaceship-prompt, use:spaceship.zsh, from:github, as:theme
  ;;
"conohatan")
  zplug denysdovhan/spaceship-prompt, use:spaceship.zsh, from:github, as:theme
  zinit ice pick"async.zsh" src"pure.zsh"
  zinit light sindresorhus/pure
  ;;
"spaceshit")
  zinit ice pick'spaceship.zsh' wait'!0'
  zinit light 'denysdovhan/spaceship-zsh-theme'
  ;;
*)
  uname="%F{magenta}%n%f"
  host="%F{yellow}%m%f"
  pwd="%F{green}%~%f"
  NEWLINE=$'\n'
  # prompt="%F{blue})%f "
  prompt="%F{blue}$%f "
  datetime="%F{cyan}%D{%m-%d %H:%M}%f"

  PROMPT="${uname}@${host}:${datetime}|${pwd}${NEWLINE}${prompt}"
  ;;
esac

# Initialize zsh completions
echo "[DEBUG] Initializing zsh completions"
autoload -Uz compinit
compinit

# Shopify Hydrogen alias to local projects
alias h2='$(npm prefix -s)/node_modules/.bin/shopify hydrogen'

# Sui version path configuration
echo "[DEBUG] Setting up Sui in .zshrc"
if [[ -f "$HOME/.suim/current" ]]; then
  export SUI_VERSION_PATH="$HOME/.suim/versions/$(cat $HOME/.suim/current)"
  export PATH="$SUI_VERSION_PATH:$PATH"
else
  echo "[DEBUG] Warning: $HOME/.suim/current not found in .zshrc"
fi

# bun completions
echo "[DEBUG] Setting up bun completions in .zshrc"
[ -s "/home/fuyu/.bun/_bun" ] && source "/home/fuyu/.bun/_bun"

echo "[DEBUG] Finished .zshrc"
