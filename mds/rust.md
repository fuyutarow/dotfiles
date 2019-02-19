# Rust
    
- Rust 2018 edition
  Rust1.31+
- Rust 2015 edition
  Rust1.30-


Rust intsall
```sh
curl https://sh.rustup.rs -sSf | sh
```
The command install `rustc`, `cargo`, `rustup`.


### What's rustup
- update 
  ```sh
  rustup update
  ```
- install from release channel
  release channel, stable, beta, nightly
  ```sh
  rustup install nightly
  rustup default stable
  ```
- define version
  ```sh
  rustup run nightly cargo run
  ```
- add component
  ```sh
  rustup component add rustfmt
  ```

### What's cargo
- create a new project
  ```sh
  cargo new --help
  ```
- clone a existing project
  ```sh
  cargo generate --git https://github.com/rustwasm/wasm-pack-template
  ```

