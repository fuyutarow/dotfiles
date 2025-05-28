# Homebrew
eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"

# PATH exports
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
source "$HOME/.cargo/env"
source <(fnm env)


# X11 configuration
if [[ -f /etc/resolv.conf ]]; then
  export DISPLAY=$(cat /etc/resolv.conf | grep nameserver | awk '{print $2}'):0
fi

# Sheldon (load this last)
source <(sheldon source)
eval "$(direnv hook zsh)"



# bun completions
[ -s "/home/fuyu/.bun/_bun" ] && source "/home/fuyu/.bun/_bun"
# Sui version path configuration
export SUI_VERSION_PATH="$HOME/.suim/versions/$(cat $HOME/.suim/current)"
export PATH="$SUI_VERSION_PATH:$PATH"


# for Rust
export RUSTC_WRAPPER="sccache"
