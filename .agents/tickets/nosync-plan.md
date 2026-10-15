+++
schema = 2
name = "nosync-plan"
outcome = "a partition of dotfiles' node/no-sync violations into independent work units along the call graph: each unit is a set of files whose conversion to async does not require editing any file in another unit (all sync callers of a converted function are inside the same unit), with violation counts, entry points, and a dependency order between units where one must land before another"
writes = []
verify = []
timeout_s = 1800
premises = ["task:gate:land"]

[proposition]
id = "NOSYNC-PARTITION"
claim = "every file with a node/no-sync violation belongs to exactly one unit, and no unit's conversion requires editing a file outside it except along a stated dependency order"
refuted_by = "a unit whose async conversion forces a signature change in a caller outside the unit that is not covered by a stated earlier unit"
+++

Measured 2026-10-15: `bunx --bun oxlint -A all -D node/no-sync .` reports 4,479 violations. Splitting by directory
failed: nosync-skills (522 violations) and nosync-tools1 (301) both returned because callers outside their writes
depend on synchronous return values (e.g. agents/{claude,codex}/hooks/task-continuity.ts await handleCompactHook).
Do, read-only:
1. Build the call graph from each sync call site up to its entry points (CLI main, hook entry, test, exported API
   used across packages). A function becomes async when it (transitively) contains a sync call.
2. Group files into units = connected components of "must change together" (a function and all its callers that
   would need `await`). Split huge components where an async boundary already exists (an entry point that can await
   once) and state the order.
3. Output a table: unit id, files, violation count, entry points, depends-on units. Aim for units that one worker can
   finish in under 40 minutes (roughly <= 400 violations), and for as many independent units as possible.
4. List call sites that cannot become async (vendor sync callbacks, top-level sync config load required by a tool)
   with file:line and why.
Write nothing.

## Current state (coordinator, 2026-10-15 15:30)
Run returned after 1m49s without the table. Inputs you lacked are provided:
- Diagnostics: ./.nosync-diagnostics.txt in this workspace (4,479 lines, oxlint `--format unix`:
  path:line:col: message). Parse that; do not rerun the full lint.
- Search: trace callers with the lexical routes `rr text '<name>'` / `rr regex '<re>'` (they use rg and do not need
  the ccc daemon), and Serena/LSP references where available. Do not stop on ccc.
Produce the unit table (unit id, files, violation count, entry points, depends-on), the non-async list, and the
recommended dispatch order. Approximate where the graph is ambiguous and mark it; a usable partition beats none.
