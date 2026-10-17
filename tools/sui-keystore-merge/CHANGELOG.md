# Changelog

## 0.2.2 — 2026-10-17

- Standardize -V/--version, plain deterministic help, and typed unknown-flag diagnostics.

## 0.2.1 — 2026-10-15

- Use asynchronous filesystem operations

## 0.2.0 — 2026-10-15

- Merge fnox-provided Sui keys and aliases into existing target files without replacing prior entries.

## 0.1.0

- Merge Sui keystore keys and aliases from environment variables while preserving target entries and active client configuration.
- Back up originals and write both files atomically with private permissions.
