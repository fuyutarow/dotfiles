sudo dpkg --add-architecture i386 
wget -nc https://dl.winehq.org/wine-builds/Release.key 
sudo apt-key add Release.key 
sudo apt-add-repository -y -n https://dl.winehq.org/wine-builds/ubuntu/ 
rm Release.key 
sudo apt update 
sudo apt install -y --install-recommends \
  winehq-stable \
  winetricks
sudo mv /usr/bin/wine /usr/bin/wine32
sudo mv /usr/bin/wine64 /usr/bin/wine
