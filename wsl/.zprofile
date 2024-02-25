
eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"
source <(sheldon source)

# alias git='git.exe'
alias c='clip.exe'
alias o='explorer.exe'
alias oo='explorer.exe .'


export PATH="$HOME/.local/bin":$PATH
export PATH="$HOME/.bun/bin":$PATH
export RUSTC_WRAPPER="$HOME/.cargo/bin/sccache"


export PATH=/usr/local/cuda-12.2/bin:$PATH
export LD_LIBRARY_PATH=/usr/local/cuda-12.2/lib64:$LD_LIBRARY_PATH

export PATH="$HOME/.config/conda/bin:$PATH"
source $HOME/.config/conda/etc/profile.d/conda.sh

source $HOME/.cargo/env
source <(fnm env)

source <(sheldon source)
