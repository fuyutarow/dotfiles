# Changelog

## 1.0.0 — 2026-10-07

- Moved from `agents/serena-control/` to `tools/serena-foreground/` (`src/`, `tests/`); behavior unchanged.
- Imports the resource runner through `tools/agent-resource-run/src/index.ts` (its public API) instead of the runner's script file.
- `serena-foreground --version` prints the version of this package.json.
