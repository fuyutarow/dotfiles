echo "[DEBUG] Starting .zprofile (macOS)"

# Homebrew (Apple Silicon)
echo "[DEBUG] Setting up Homebrew"
if [[ -x /opt/homebrew/bin/brew ]]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
elif [[ -x /usr/local/bin/brew ]]; then
  eval "$(/usr/local/bin/brew shellenv)"
else
  echo "[DEBUG] Homebrew not found"
fi

# PATH exports
echo "[DEBUG] Setting up PATH exports"
export PATH="$HOME/.local/bin:$PATH"
export PATH="$HOME/.bun/bin:$PATH"
export PATH="$HOME/.bun/install/global/node_modules/.bin:$PATH"


# GNU coreutils (gtimeout etc.)
if [[ -d /opt/homebrew/opt/coreutils/libexec/gnubin ]]; then
  export PATH="/opt/homebrew/opt/coreutils/libexec/gnubin:$PATH"
fi

# Source commands
echo "[DEBUG] Sourcing cargo env"
if [[ -f "$HOME/.cargo/env" ]]; then
  else
  echo "[DEBUG] Warning: $HOME/.cargo/env not found"
fi

echo "[DEBUG] Setting up fnm"
if command -v fnm &> /dev/null; then
  eval "$(fnm env)"
else
  echo "[DEBUG] Warning: fnm not found"
fi

# Sheldon (load this last)
echo "[DEBUG] Setting up sheldon"
if command -v sheldon &> /dev/null; then
  eval "$(sheldon source)"
else
  echo "[DEBUG] Warning: sheldon not found"
  # Fallback: load aliases directly
  echo "[DEBUG] Loading aliases.zsh directly as fallback"
  if [[ -f "$HOME/dotfiles/common/aliases.zsh" ]]; then
    source "$HOME/dotfiles/common/aliases.zsh"
  fi
fi

echo "[DEBUG] Setting up direnv"
if command -v direnv &> /dev/null; then
  eval "$(direnv hook zsh)"
else
  echo "[DEBUG] Warning: direnv not found"
fi

# bun completions
echo "[DEBUG] Setting up bun completions"
[ -s "$HOME/.bun/_bun" ] && source "$HOME/.bun/_bun"

# for Rust
if command -v sccache &> /dev/null; then
  export RUSTC_WRAPPER="sccache"
fi

echo "[DEBUG] Finished .zprofile (macOS)"
