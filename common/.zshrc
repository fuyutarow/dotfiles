# Gate startup debug logs behind $DOTFILES_DEBUG (export DOTFILES_DEBUG=1 to see them)
_dbg(){ [[ -n "$DOTFILES_DEBUG" ]] && echo "[DEBUG] $*"; }

_dbg "Starting .zshrc"

# Load sheldon if not already loaded (non-login shells skip .zprofile)
if ! type z &>/dev/null && command -v sheldon &>/dev/null; then
  _dbg "Loading sheldon from .zshrc"
  eval "$(sheldon source)"
fi

#zplug sindresorhus/pure, use:pure.zsh, from:github, as:theme
_dbg "Setting up theme based on HOST: $HOST"
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
_dbg "Initializing zsh completions"
autoload -Uz compinit
compinit

# Shopify Hydrogen alias to local projects
alias h2='$(npm prefix -s)/node_modules/.bin/shopify hydrogen'

# Suim (Sui version manager) configuration
_dbg "Setting up Suim in .zshrc"
if [[ -d "$HOME/.suim" ]]; then
  export PATH="$HOME/.suim:$PATH"
  if [[ -f "$HOME/.suim/current" ]]; then
    export SUI_VERSION_PATH="$HOME/.suim/versions/$(<$HOME/.suim/current)"
    export PATH="$SUI_VERSION_PATH:$PATH"
  fi
else
  _dbg "Warning: $HOME/.suim directory not found in .zshrc"
fi

# bun completions
_dbg "Setting up bun completions in .zshrc"
[ -s "$HOME/.bun/_bun" ] && source "$HOME/.bun/_bun"

_dbg "Finished .zshrc"

# juliaup (cross-platform; guarded, $HOME-relative — do NOT let juliaup write
# machine-absolute paths here; if it re-appends its managed block, fold it back into this form)
[[ -d "$HOME/.juliaup/bin" ]] && path=("$HOME/.juliaup/bin" $path) && export PATH
[[ -f "$HOME/.julia/juliaup/completions/zsh.zsh" ]] && source "$HOME/.julia/juliaup/completions/zsh.zsh"

# Machine/OS-specific PATH entries belong in mac/.zprofile or wsl/.zprofile, not here.
