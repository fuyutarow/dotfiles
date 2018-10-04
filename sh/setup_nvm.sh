export NVM_DIR="$HOME/.nvm"
sudo apt update
sudo apt install -y build-essential libss1-dev
mkdir -p $NVM_DIR
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.11/install.sh | bash
