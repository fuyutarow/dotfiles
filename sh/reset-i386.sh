dpkg --get-selections | awk '/i386/{print $1}'
sudo apt-get remove --purge `dpkg --get-selections | awk '/i386/{print $1}'`
sudo dpkg --remove-architecture i386
