# Changelog

## 0.11.2 — 2026-10-16

- Add fail-closed read-only command isolation for bounded VCS inspection.

## 0.11.1 — 2026-10-16

- Read Codex account usage across sessions and recover events beyond bounded tails

## 0.11.0 — 2026-10-16

- Expose exact heredoc content and shared shell-write ratchet for hook and commit-gate enforcement.

## 0.10.2 — 2026-10-16

- Repair owner access on test temp directories before teardown; warn with the path if removal fails.

## 0.10.1 — 2026-10-16

- Replace workspace path non-null assertion with defined string slicing.

## 0.10.0 — 2026-10-16

- storage-headroom: guestPressure, loadGuestDrive and an episode ledger decide when guest / or /tmp queues guest-capacity-recover.service

## 0.9.0 — 2026-10-15

- Add agent-name: the one format and parser for agent session names, <project-slug>-<role>_<id> (hyphenated project slug, one underscore between role and id)

## 0.8.0 — 2026-10-15

- Add the bun test preload that gives every test process its own TMPDIR under one per-run parent, removed at the end of the run and swept by the next run after a kill.

## 0.7.0 — 2026-10-14

- Own shared Bash syntax parsing and hook path resolution, including shell-safe quoting.
- Separate dependency-free value readers from the JSON codec so decision modules need not load the codec bundle.

## 0.6.0 — 2026-10-11

- Add a shared GPU-tool visibility diagnostic for explicit GPU requests.

## 0.5.0 — 2026-10-11

- Add a reusable stderr progress adapter over pinned `@clack/prompts` 1.8.1 taskLog groups, with concurrent status rows, injected clocks/output, plain fallback, counters, rates, optional ETA, and idempotent cleanup.

## 0.4.6 — 2026-10-10

- Own the progress-sidecar contract, including optional `turns`: strict writer validation and a reader that validates known fields while discarding unknown additions.

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
