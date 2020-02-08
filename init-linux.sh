sudo apt update 
sudo apt upgrade -y
sudo apt install -y build-essential curl file git
sudo apt install -y libssl-dev
make link
make add-rust
source $HOME/.cargo/env
make up-rust
