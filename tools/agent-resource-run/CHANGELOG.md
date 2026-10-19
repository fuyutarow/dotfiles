# Changelog

## 1.5.8 — 2026-10-19

- Count each GPU reservation once during in-scope admission re-checks

## 1.5.7 — 2026-10-19

- Refuse GPU admission without healthy, scoped, and sufficient VRAM evidence

## 1.5.6 — 2026-10-19

- Default to one host GPU job and retain slots through failed scope cleanup until all descendants exit

## 1.5.5 — 2026-10-19

- Wait for ccc CUDA process exit before acquiring research GPU slots

## 1.5.4 — 2026-10-19

- Replace resource ledgers and monitors with bounded flock slots and systemd scopes while retaining caller contracts.

## 1.5.3 — 2026-10-18

- Deny GPU admissions with recorded stall evidence

## 1.5.2 — 2026-10-17

- Standardize -V/--version, plain deterministic help, and typed unknown-flag diagnostics.

## 1.5.1 — 2026-10-17

- Use cached GPU owner observations for admission and VRAM monitoring.

## 1.5.0 — 2026-10-16

- Add read-only slot status with capacity provenance, holder and FIFO queue identities, and timestamped wait/acquisition events.

## 1.4.6 — 2026-10-15

- Give resource process groups at least thirty seconds to finish after SIGTERM before SIGKILL.

## 1.4.5 — 2026-10-15

- Restore ccc's standing GPU reservation to its 2048 MiB elastic-cap floor.

## 1.4.4 — 2026-10-15

- Enable elastic ccc allocator caps from free VRAM and live research reservations.

## 1.4.3 — 2026-10-15

- Increase ccc's standing GPU partition to 6144 MiB and reserve it from research GPU admission

## 1.4.2 — 2026-10-15

- ccc uses its reserved GPU partition for indexing, waits when unavailable, and keeps embedding batches off CPU.

## 1.4.1 — 2026-10-12

- Report a live non-runner reservation-lock owner as an admission denial instead of waiting and
  exiting 70; retain stale-lock cleanup for dead owners.
- Open reservation files close-on-exec, and make the ccc daemon use the same single XDG runtime
  state path as agent-resource-run.

## 1.4.0 — 2026-10-12

- Refuse admission and `--check-only` when the latest WSL capacity recovery verdict is a fresh
  HOLD or reports a Windows memory emergency. Missing and stale verdicts are reported and allow
  admission.

## 1.3.1 — 2026-10-12

- Retry timed-out `nvidia-smi` probes with bounded backoff, preserve timeout as an indeterminate
  result instead of reporting an absent GPU, and include exit status, stderr, attempts and elapsed
  time in probe warnings and denials. Missing tools and confirmed missing devices remain explicit.

## 1.3.0 — 2026-10-11

- Added machine-wide FIFO `julia-compile` slot admission for manifest-declared compile work and
  `--slot julia-compile` invocations. Host capacity comes from `slots.toml`, defaulting to one
  slot per six available CPUs with a floor of one; dead controller owners are reclaimed.

## 1.2.0 — 2026-10-09

- Fall back from missing per-process GPU rows to the admitted device's used-VRAM delta from a
  pre-launch baseline. Peak artifacts record the measurement method and raw device values; the
  report notes that device-wide deltas may include other GPU processes. Unavailable measurements
  are explicit `null` values.

## 1.1.0 — 2026-10-08

- Changed GPU admission from summing every live declaration to measured device use plus declared
  headroom for warming jobs and the new job's declared cap. The existing VRAM safety margin and
  per-device concurrency limit still apply. When nvidia-smi process measurement fails, the runner
  warns and falls back to the prior declared-sum rule.
- Enforced `vram_peak_bytes` as a per-job VRAM cap: two samples above 105% terminate the process
  group/scope and record `VRAM_CAP_EXCEEDED`, the peak, and the cap in RELEASE/peak JSON.
- Added admission basis and measured-at-admission fields to GPU ADMIT/RELEASE output and peak JSON.

## 1.0.0 — 2026-10-07

- Moved from `agents/resource-control/` to `tools/agent-resource-run/` (`src/`, `src/lib/`, `tests/`, `examples/`); behavior unchanged.
- `agent-resource-run --version` prints the version of this package.json.
- `src/index.ts` is the tool's public API (`executeJob`, `validateManifest`, `ResourceManifest`), the only entry other tools import.
