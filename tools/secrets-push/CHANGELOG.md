# Changelog

## 0.2.3 — 2026-10-17

- Standardize -V/--version, plain deterministic help, and typed unknown-flag diagnostics.

## 0.2.2 — 2026-10-15

- Use async fs and child-process APIs throughout so the tool no longer blocks the event loop; behavior is unchanged.

## 0.2.1 — 2026-10-15

- Remove exactly one output newline from fnox get before verification. Account for fnox stdin set trimming surrounding whitespace and disclose that normalization when it changes the source value; retain SHA-256 mismatch failures for stored byte changes.

## 0.2.0 — 2026-10-15

- Relay selected fnox secrets from local or SSH sources to SSH targets and verify each transfer by SHA-256.

## 0.1.0

- Relay selected fnox secrets from this machine or an SSH source to an SSH target over stdin, then verify each value by SHA-256.
- Add named file sources and safe updates for configs owned by this tool.
