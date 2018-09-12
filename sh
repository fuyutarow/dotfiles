cd $HOME/.tmp
git clone https://github.com/hzeller/timg.git
cd timg/src
sudo apt install libwebp-dev libgraphicsmagick++-dev    # required libs.
make
sudo make install
cd -
