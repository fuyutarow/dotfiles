# Changelog

## 1.3.1 — 2026-10-15

- Classify timed-out searches against daemon status so indexing reports BUSY progress and unavailable daemons remain FATAL.

## 1.3.0 — 2026-10-15

- Make index plans actionable with data-only exclude suggestions and measured per-host indexing rates

## 1.2.0 — 2026-10-15

- Plan ccc's matcher scope before indexing and refuse over-budget plans with safe exclude suggestions.

## 1.1.0 — 2026-10-14

- Own hook search classification, project resolution, rewrite generation, and denial guidance through `decideSearchRoute`; reduce the hook to protocol adaptation.

## 1.0.9 — 2026-10-14

- Count startup and preflight checks against the reindex search deadline, reserving time to return BUSY within ten seconds end to end.
- Bound semantic search during daemon reindexing; report BUSY and lexical routes when the search child times out.
- Record the detached index worker PID so BUSY diagnostics can identify it.

## 1.0.8 — 2026-10-14

- Serve completed indexes within the configured staleness bound while detached reindexing runs, and report the watermark, gap, changed files, and reindex status.

## 1.0.7 — 2026-10-14

- Report the detached reindex status command in NO_INDEX output and omit manual registration/reindex repair advice when a reindex was requested.

## 1.0.6 — 2026-10-13

- Start one detached, rate-limited reindex when semantic search finds a stale index; report the stale state and lexical routes available meanwhile.
- Add `rr regex -i` and permit grep/rg filters after jq in non-search output pipelines.

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
