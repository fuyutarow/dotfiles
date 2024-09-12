# Homebrew
eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"

# PATH exports
export PATH="$HOME/.local/bin:$PATH"
export PATH="$HOME/.bun/bin:$PATH"
export PATH="/usr/local/cuda-12.2/bin:$PATH"
export LD_LIBRARY_PATH="/usr/local/cuda-12.2/lib64:$LD_LIBRARY_PATH"

# # Conda
# export PATH="$HOME/miniconda3/bin:$PATH"
# source $HOME/miniconda3/etc/profile.d/conda.sh

# Other environment setups
export RUSTC_WRAPPER="$HOME/.cargo/bin/sccache"

# Source commands
source "$HOME/.rye/env"
source "$HOME/.cargo/env"
source <(fnm env)
source <(micromamba shell hook --shell zsh)

# WSL-specific aliases
if [[ "$(uname -r)" == *Microsoft* ]]; then
  alias c='clip.exe'
  alias open='explorer.exe'
  alias o="open"
  alias oo='open .'
  alias winget='winget.exe'
fi

# X11 configuration
if [[ -f /etc/resolv.conf ]]; then
  export DISPLAY=$(cat /etc/resolv.conf | grep nameserver | awk '{print $2}'):0
fi

# Sheldon (load this last)
source <(sheldon source)
