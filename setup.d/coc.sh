#!/bin/bash
vi +":CocInstall coc-rls" +qa ;: Rust
vi +":CocInstall coc-python" +qa
vi +":CocInstall coc-tsserver" +qa ;: TypeScript
vi +":CocInstall coc-html" +qa
vi +":CocInstall coc-css" +qa
vi +":CocInstall coc-yaml" +qa
vi +":CocInstall coc-vetur" +qa ;: Vue
vi +":CocInstall coc-solargraph" +qa ;: Ruby
vi +":CocInstall coc-emoji" +qa ;: for Markdown file only

brew install shfmt ;: sh
