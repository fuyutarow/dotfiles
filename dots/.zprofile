eval "$(/opt/homebrew/bin/brew shellenv)"
source <(sheldon source)
source $HOME/.cargo/env
source <(fnm env)

export PATH="$HOME/.bun/bin":$PATH
export RUSTC_WRAPPER="$HOME/.cargo/bin/sccache"
