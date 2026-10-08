# Changelog

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
