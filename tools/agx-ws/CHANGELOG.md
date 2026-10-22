# Changelog

## 0.12.3 — 2026-10-23

- Require run judgment and landing before workspace cleanup

## 0.12.2 — 2026-10-23

- Generalize the parent pipe-draining test description

## 0.12.1 — 2026-10-23

- Use one main-checkout config resolution rule for every workspace command

## 0.12.0 — 2026-10-23

- Replace repository discovery overrides with AGX_REPOS_ROOT while preserving registry defaults

## 0.11.0 — 2026-10-23

- Replace doctor quiet environment control with --quiet and reject the retired variable.

## 0.10.0 — 2026-10-19

- Remove the bare ws command alias; use agx ws or agx-ws.

## 0.9.1 — 2026-10-19

- Probe graveyard filesystem type with GNU stat first and BSD stat as fallback.

## 0.9.0 — 2026-10-19

- Emit workspace doctor findings in the shared JSON Lines shape

## 0.8.5 — 2026-10-18

- Reduce doctor work by sharing run history, skipping silent recent landing checks, and batching content comparisons.

## 0.8.4 — 2026-10-17

- Keep ws add independent of repository-wide verdict scans and enforce a whole-command deadline that names the active step.

## 0.8.3 — 2026-10-17

- Bound subprocess waits with named deadlines, close retained pipes after child exit, and preserve readiness exit status.

## 0.8.2 — 2026-10-17

- Standardize -V/--version, plain deterministic help, and typed unknown-flag diagnostics.

## 0.8.1 — 2026-10-17

- Keep workspace GC classification and dry runs lock-free; re-check each removal under the store lock and yield to waiting commands with holder and elapsed-time diagnostics.

## 0.8.0 — 2026-10-17

- Expose workspace GC verdict counts as JSON.
- Publish atomic per-repository workspace verdict inventories from GC and workspace mutations

## 0.7.1 — 2026-10-17

- Exclude workspaces collectible by the safe unattended gc timer from doctor findings

## 0.7.0 — 2026-10-17

- Add ws add --json with readiness output isolated on stderr

## 0.6.0 — 2026-10-17

- Allow reuse of an existing registered workspace

## 0.5.2 — 2026-10-17

- Reject nonconforming new workspace slugs while retaining legacy workspace lookup

## 0.5.1 — 2026-10-17

- Fix adoption slugs, re-home already adopted workspaces with --fix-names, roll back failed adoption, and report cross-named orphans

## 0.5.0 — 2026-10-17

- Add ws adopt to re-home legacy workspace changes with process and keep guards, plus read-only orphan reporting.

## 0.4.1 — 2026-10-16

- Collect immutable workspace commits without abandoning them

## 0.4.0 — 2026-10-16

- Add opt-in collection of workspaces whose runs ended unaccepted over 24 hours ago

## 0.3.2 — 2026-10-16

- Add read-only workspace fleet findings

## 0.3.1 — 2026-10-16

- Recognize released workspace content and land-consumed changesets, report differing paths, and safely collect idle land checkouts

## 0.3.0 — 2026-10-16

- Enumerate all jj workspaces for gc, protect committed keep declarations, resolve repository trunk, and opt legacy cleanup in with --legacy; add --all and TSV classification.

## 0.2.1 — 2026-10-16

- Move the workspace CLI under the agx-ws part and keep ws

## 0.2.0 — 2026-10-16

- Refresh stale workspaces before readiness, add ws refresh, create complete sparse workspaces, and report narrowed sparse sets in gc.

## 0.1.3 — 2026-10-16

- Rename the workspace tool directory and package to jj-ws; keep the ws command unchanged.

## 0.1.2 — 2026-10-16

- Narrow workspace names and pending ref paths before use.

## 0.1.1 — 2026-10-16

- Trust workspace mise configs before readiness so sandboxed workers can use them without writing mise trust state.

## 0.1.0 — 2026-10-16

- Add ws, the run-workspace lifecycle tool: add creates <repo>.ws/ws_<slug> and runs the repo's readiness commands, rm refuses an unlanded change, gc collects only terminal agx lineages with no live pid and no unlanded change; it keeps no state of its own.
