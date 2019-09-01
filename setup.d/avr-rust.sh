# ディレクトリを作って、その中に移動します
mkdir -p ~/avr-rust
cd ~/avr-rust

# ダウンロードして初期設定を行います。30分くらいかかりました
git clone https://github.com/avr-rust/rust.git
cd rust
mkdir build && cd build
../rust/configure \
  --enable-debug \
  --disable-docs \
  --enable-llvm-assertions \
  --enable-debug-assertions \
  --enable-optimize \
  --prefix=/opt/avr-rust

make

mkdir .local/avr-rust
# sudo chown ${USER} .local/avr-rust

# インストールします
make install

# rustにavr-toolchainを追加します
rustup toolchain link avr-toolchain $(realpath $(find . -name 'stage1'))
