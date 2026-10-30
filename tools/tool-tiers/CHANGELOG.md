# Changelog

## 0.2.4 — 2026-10-30

- Raise the semlint core floor to 0.2.1.

## 0.2.3 — 2026-10-30

- Fix brew shadow doctor test fixtures and PATH expectations

## 0.2.2 — 2026-10-30

- Replace dx with semlint as a core Homebrew tool.

## 0.2.1 — 2026-10-29

- Warn on dx name collisions while retaining core floor failures.

## 0.2.0 — 2026-10-29

- Check declared agx and dx version floors and diagnose untrusted taps.

## 0.1.4 — 2026-10-17

- Standardize -V/--version, plain deterministic help, and typed unknown-flag diagnostics.

## 0.1.3 — 2026-10-16

- Detect duplicate PATH copies of declared Homebrew commands
- Detect Homebrew command shadows before brew on PATH or in user bin directories, ignoring later system copies.

## 0.1.2 — 2026-10-15

- Map the macOS espanso cask to its espanso command for tier lookup and audits.

## 0.1.1 — 2026-10-14

- Map the WSL Codex cask to its `codex` command, include casks in tier lookup, and install missing declared casks with `brew install --cask`.
