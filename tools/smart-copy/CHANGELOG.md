# Changelog

## 0.1.4 — 2026-11-27

- Paths follow the repository's move of topic directories under config/ (for example config/cocoindex, config/zsh).

## 0.1.3 — 2026-11-25

- Error handling uses better-result instead of neverthrow
- WSL is decided by isWslDistro, so a container on the WSL kernel is treated as plain Linux

## 0.1.2 — 2026-11-20

- Declare the tool in tool.toml: shell fragment and clipboard probe now live in the tool directory

## 0.1.1 — 2026-11-20

- Header names the switched callers; no behavior change

## 0.1.0 — 2026-11-20

- Add smart-copy: copies stdin to the terminal (OSC 52, written not delivered) and to this machine's clipboard tool, deciding nothing from SSH_*/HERDR_* state
