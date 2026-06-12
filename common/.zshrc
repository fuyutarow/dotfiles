echo "[DEBUG] Starting .zshrc"

# Load sheldon if not already loaded (non-login shells skip .zprofile)
if ! type z &>/dev/null && command -v sheldon &>/dev/null; then
  echo "[DEBUG] Loading sheldon from .zshrc"
  eval "$(sheldon source)"
fi

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

# Suim (Sui version manager) configuration
echo "[DEBUG] Setting up Suim in .zshrc"
if [[ -d "$HOME/.suim" ]]; then
  export PATH="$HOME/.suim:$PATH"
  if [[ -f "$HOME/.suim/current" ]]; then
    export SUI_VERSION_PATH="$HOME/.suim/versions/$(<$HOME/.suim/current)"
    export PATH="$SUI_VERSION_PATH:$PATH"
  fi
else
  echo "[DEBUG] Warning: $HOME/.suim directory not found in .zshrc"
fi

# bun completions
echo "[DEBUG] Setting up bun completions in .zshrc"
[ -s "$HOME/.bun/_bun" ] && source "$HOME/.bun/_bun"

echo "[DEBUG] Finished .zshrc"

# >>> juliaup initialize >>>

# !! Contents within this block are managed by juliaup !!

path=('/Users/fuyu/.juliaup/bin' $path)
export PATH
# Tab completion for juliaup and julia channel selection
[ -f "/Users/fuyu/.julia/juliaup/completions/zsh.zsh" ] && source "/Users/fuyu/.julia/juliaup/completions/zsh.zsh"

# <<< juliaup initialize <<<

# Added by Antigravity IDE
export PATH="/Users/fuyu/.antigravity-ide/antigravity-ide/bin:$PATH"
