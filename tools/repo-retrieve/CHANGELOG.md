# Changelog

## 1.0.5 — 2026-10-13

- Wait for observable ccc indexing progress instead of timing out on a fixed clock; add detached indexing with persistent status and HEAD-staleness reporting.

## 1.0.4 — 2026-10-13

- Resolve jj workspaces to their registered backing repo for semantic routes, report the index scope, and refuse to build an index from a workspace.

## 1.0.3 — 2026-10-08

- Make semantic NO_INDEX diagnostics identify daemon availability, provide project registration/index recovery, and identify lexical routes that remain available. `about`, `absent`, and `exists` return exit 3 with `verdict=UNVERIFIED` in JSON mode.
- Add repository-scope notes to lexical NO_MATCH results and an outside-repo scratchpad lookup hint for path-like queries.

## 1.0.2 — 2026-10-08

- Use the official TypeSafe API for Jev definition judging.

## 1.0.1 — 2026-10-07

- Directory renamed from tools/rr/; no behavior change.

## 1.0.0 — 2026-10-07

- Moved from `agents/retrieval-control/` into the repo's tools CLI layout (`src/`, `tests/`, `retrieval.toml` beside `package.json`); behavior unchanged.
- `rr --version` / `repo-retrieve --version` print the version of this package.json.
