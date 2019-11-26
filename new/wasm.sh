#!/bin/bash
read -p 'new project name: ' name
echo ${name}
cargo new --lib "${name}"
cd "${name}"
cargo add wasm-bindgen
