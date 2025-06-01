echo "[DEBUG] Starting .zprofile"

# Homebrew
echo "[DEBUG] Setting up Homebrew"
if [[ -x /home/linuxbrew/.linuxbrew/bin/brew ]]; then
  eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"
else
  echo "[DEBUG] Homebrew not found at /home/linuxbrew/.linuxbrew/bin/brew"
fi

# PATH exports
echo "[DEBUG] Setting up PATH exports"
export PATH="$HOME/.local/bin:$PATH"
export PATH="$HOME/.bun/bin:$PATH"
export PATH="$HOME/.bun/install/global/node_modules/.bin:$PATH"

export CUDA_HOME=/usr/local/cuda-12.4
export PATH=$CUDA_HOME/bin:$PATH
export LD_LIBRARY_PATH=$CUDA_HOME/lib64:$LD_LIBRARY_PATH

# # Conda
# export PATH="$HOME/miniconda3/bin:$PATH"
# source $HOME/miniconda3/etc/profile.d/conda.sh

export PATH="$HOME/.cargo/bin:$PATH"


# Source commands
echo "[DEBUG] Sourcing cargo env"
if [[ -f "$HOME/.cargo/env" ]]; then
  source "$HOME/.cargo/env"
else
  echo "[DEBUG] Warning: $HOME/.cargo/env not found"
fi

echo "[DEBUG] Setting up fnm"
if command -v fnm &> /dev/null; then
  # Use timeout to prevent hanging
  timeout 5s bash -c 'fnm env' > /tmp/fnm_env 2>/dev/null
  if [[ $? -eq 0 ]]; then
    source /tmp/fnm_env
  else
    echo "[DEBUG] Warning: fnm env timed out or failed"
  fi
else
  echo "[DEBUG] Warning: fnm not found"
fi


# X11 configuration
echo "[DEBUG] Setting up X11"
if [[ -f /etc/resolv.conf ]]; then
  export DISPLAY=$(cat /etc/resolv.conf | grep nameserver | awk '{print $2}'):0
fi

# Sheldon (load this last)
echo "[DEBUG] Setting up sheldon"
if command -v sheldon &> /dev/null; then
  # Use timeout to prevent hanging
  timeout 5s bash -c 'sheldon source' > /tmp/sheldon_source 2>/dev/null
  if [[ $? -eq 0 ]]; then
    source /tmp/sheldon_source
  else
    echo "[DEBUG] Warning: sheldon source timed out or failed"
    # Fallback: load aliases directly
    echo "[DEBUG] Loading aliases.zsh directly as fallback"
    if [[ -f "$HOME/dotfiles/common/aliases.zsh" ]]; then
      source "$HOME/dotfiles/common/aliases.zsh"
    fi
  fi
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
[ -s "/home/fuyu/.bun/_bun" ] && source "/home/fuyu/.bun/_bun"

# Sui version path configuration
echo "[DEBUG] Setting up Sui"
if [[ -f "$HOME/.suim/current" ]]; then
  export SUI_VERSION_PATH="$HOME/.suim/versions/$(cat $HOME/.suim/current)"
  export PATH="$SUI_VERSION_PATH:$PATH"
else
  echo "[DEBUG] Warning: $HOME/.suim/current not found"
fi


# for Rust
export RUSTC_WRAPPER="sccache"

echo "[DEBUG] Finished .zprofile"