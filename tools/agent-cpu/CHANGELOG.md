# Changelog

## 0.4.0 — 2026-11-25

- agent-cpu answers -V/--version and --help and rejects unknown flags through the shared CLI surface; --out is unchanged
- Each session's workers carry their runs' ids and start times (workers.runs)

## 0.3.1 — 2026-10-31

- Resolve Codex resume sessions without an open rollout descriptor.

## 0.3.0 — 2026-10-30

- Add macOS process resource sampling

## 0.2.0 — 2026-10-30

- Add schema 2 RAM and VRAM resource metrics
