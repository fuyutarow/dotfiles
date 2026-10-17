# Changelog

## 0.2.4 — 2026-10-17

- Standardize -V/--version, plain deterministic help, and typed unknown-flag diagnostics.

## 0.2.3 — 2026-10-16

- Leave workspace creation enforcement to ws-sole-creator and remove duplicate checkout policy gates

## 0.2.2 — 2026-10-16

- Export inode warning and denial thresholds for statusline without changing enforcement values.

## 0.2.1 — 2026-10-15

- Allow unparseable jj workspace adds with a warning and name the sparse command for proven policy denials

## 0.2.0

- Expose the storage allow/warn/deny decision as a tools entry; the PreToolUse hook only adapts stdin and the vendor envelope.
- Move command, checkout, cache, budget, and recovery policy tests alongside the decision logic; reuse shared config validators.

## 0.1.3

- Allow small hook writes to the current user's session scratchpad below the storage deny line.

## 0.1.2

- Replace the detached checkout-size measurement with bounded synchronous probes and a shared per-repository cache entry.

## 0.1.1

- Keep unknown checkout sizes from blocking small `jj` repositories while a bounded background measurement fills the cache.

## 0.1.0

- Add the read-only `storage-headroom` CLI over the shared storage policy.
