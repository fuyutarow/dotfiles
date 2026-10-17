# Changelog

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
