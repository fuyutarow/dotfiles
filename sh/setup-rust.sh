#!/bin/bash
curl https://sh.rustup.rs -sSf | sh
source $HOME/.cargo/env

if [[ "$OSTYPE" == "linux-gnu" ]]; then
	sudo apt update
	sudo apt build-essential
	sudo apt install -y libzmq3-dev jupyter-notebook
elif [[ "$OSTYPE" == "darwin"* ]]; then
	brew install zeromq pkg-config
else
	echo "This OSTYPE not supported."
fi

rustc -V
cargo -v
rustup update stable
rustc -V
cargo -V
cargo install evcxr_repl
cargo install evcxr_jupyter
evcxr
