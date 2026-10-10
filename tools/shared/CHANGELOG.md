# Changelog

## 0.4.5 — 2026-10-10

- Add bounded-tail and line-streaming helpers for JSONL readers.

## 0.4.4 — 2026-10-10

- Extend active markers with run phase, vendor session, final cost and final worker usage for post-exit statusline rows.

## 0.4.3 — 2026-10-10

- Format known positive USD costs to cents and retain `<$0.01` for positive sub-cent amounts; zero and unknown values keep their prior behavior.

## 0.4.2 — 2026-10-10

- Own the strict agx active-marker writer contract, its forward-compatible reader schema, and shared malformed-versus-unreadable classification.

## 0.4.1 — 2026-10-10

- Add bounded, locked, atomically persisted GPU samples with zod parsing, WSL executable discovery, jittered 10–20 s sampling, and 15/60-minute estimates. Discard corrupt history and retain at most two hours.

## 0.4.0 — 2026-10-09

- Share roster row price lookup and Codex token cost calculation across tools.

## 0.3.0 — 2026-10-08

- Added shared storage-headroom threshold loading, assessment, and statfs measurement, plus a
  directory lock that queues behind live holders and takes over stale locks.

## 0.2.0 — 2026-10-07

- Added `src/decode.ts` (the tests' zod-first `decoded` / `decodedJson`, moved from `agents/hooks/tests/decode.ts`, which re-exports it) so a tool's tests need not import `agents/`.

## 0.1.0 — 2026-10-07

- Created from `agents/hooks/{zod,attempt,typesafe-key,narrow}.ts` and `smart-open/sockets.ts`.
