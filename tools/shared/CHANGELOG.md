# Changelog

## 0.4.0 — 2026-10-09

- Share roster row price lookup and Codex token cost calculation across tools.

## 0.3.0 — 2026-10-08

- Added shared storage-headroom threshold loading, assessment, and statfs measurement, plus a
  directory lock that queues behind live holders and takes over stale locks.

## 0.2.0 — 2026-10-07

- Added `src/decode.ts` (the tests' zod-first `decoded` / `decodedJson`, moved from `agents/hooks/tests/decode.ts`, which re-exports it) so a tool's tests need not import `agents/`.

## 0.1.0 — 2026-10-07

- Created from `agents/hooks/{zod,attempt,typesafe-key,narrow}.ts` and `smart-open/sockets.ts`.
