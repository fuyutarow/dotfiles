# Changelog

## 1.0.0 — 2026-10-07

- Moved from `agents/resource-control/` to `tools/agent-resource-run/` (`src/`, `src/lib/`, `tests/`, `examples/`); behavior unchanged.
- `agent-resource-run --version` prints the version of this package.json.
- `src/index.ts` is the tool's public API (`executeJob`, `validateManifest`, `ResourceManifest`), the only entry other tools import.
