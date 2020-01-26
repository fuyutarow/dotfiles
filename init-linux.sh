sudo apt update 
sudo apt upgrade 
sudo apt install -y build-essential curl file git
make link
make add-rust
source $HOME/.cargo/env
make up-rust
