# Dispatch roster environment regression (2026-10-22)

## Finding and bounded repair

The 8.0.1 helper passed the caller environment to check, but its systemd-run
argument vector forwarded only the two session variables. The child independently
loads its roster. A valid dispatch binding alone did not constrain roster selection.

Current source locations:

- `tools/agx-worker/src/dispatch.ts:195`: copy caller environment; resolve a nonempty
  explicit roster path against dispatch cwd exactly once. Empty input remains invalid.
- `tools/agx-worker/src/dispatch.ts:300`: preflight receives this environment.
- `tools/agx-worker/src/dispatch.ts:325`: generated binding contains run identity,
  ticket, workspace and unit, with no second roster configuration authority.
- `tools/agx-worker/src/dispatch.ts:344`: systemd-run preserves both session variable
  forwards and adds only `-E DISPATCH_ROSTER_PATH` when explicitly supplied.
- `tools/agx-worker/src/next/preflight.ts:258`: child preflight loads the environment's roster.
- `tools/agx-worker/src/next/route.ts:35`: routing loads the same environment variable.
- `tools/agx-worker/src/next/run.ts:255`: run selects through route; its subsequent
  started event uses the binding's identity/workspace/unit and selected row.
- `agents/models/roster.ts:106`: production loader returns failure for unavailable,
  malformed or empty explicit configuration; only undefined uses the normal default.

No binding schema change is required to repair this environment propagation defect.
The path remains a live configuration reference, not a frozen roster snapshot.

## Smallest fake and reproduction

`tools/agx-worker/tests/dispatch.test.ts:391` invokes the real CLI dispatch helper
with both --ws and --unit. The existing fake systemd-run now optionally starts a
separate Bun child with only the environment forwarded by -E, plus isolated
HOME/XDG fixture directories. It deliberately uses a different cwd. The fake
preflight and fake child use the production loadRoster function with an isolated,
single-row fixture roster and observe only roster path/default and fixture session
values. It never routes to a service or invokes a model. The original binding is
schema-checked and matched against the recorded receipt.

Before changing production code:

`bun test tools/agx-worker/tests/dispatch.test.ts` exited 1: 14 pass, 3 fail.
Both absolute and relative explicit paths were lost: child path was null and its
selected default differed from fixture-high. A roster made malformed after check
also incorrectly became success through the child's default. These failures used
the real dispatch helper, not a direct worker-run substitute.

After repair, the first run exited 0: 17 pass. The final expanded run exited 0:
18 pass, 0 fail, 95 assertions. The count is test cases, including parameterized
cases. Additional assertions compare preflight and child observations directly;
an empty explicit path is also rejected. Absolute paths include a space; relative
paths resolve consistently despite the child's unrelated cwd. Without an override,
production loader default behavior remains intact and no roster forward is added.
Malformed, missing and empty overrides fail before starting; a stale malformed
file at child start fails without publishing a successful receipt.

Final verification:

- `bun test tools/agx-worker/tests/dispatch.test.ts`: exit 0, 18 pass.
- `bunx --bun oxlint --type-aware tools/agx-worker/src/dispatch.ts tools/agx-worker/tests/dispatch.test.ts`:
  exit 0 after correcting fixture boundary decoding and environment typing.
- `bunx --bun oxfmt --check tools/agx-worker/src/dispatch.ts tools/agx-worker/tests/dispatch.test.ts`:
  exit 0.
- `bun /home/fuyu/.agents/skills/writing-bun-scripts/scripts/script-check.ts tools/agx-worker/src/dispatch.ts tools/agx-worker/tests/dispatch.test.ts`:
  exit 0, FAIL=0 WARN=0 (structural floor only).
- Shared roster SHA-256 before/after final regression: identical,
  `5f36a873135b2cd5f3e488b4e18ec9ab22b80fcc4b4a4ccee1632b8c39c62faa`.

## Release intent and limits

`mise run changeset -- agx-worker patch 'Preserve explicit roster configuration across dispatch'`
exited 0 and generated `.changes/preserve-explicit-roster-configuration-across-dispatch.md`.
This requests the next patch (8.0.2 from 8.0.1); version and changelog application
remain owned by landing. No version/changelog was edited manually.

No real units, workers, model calls, relay calls, shared roster edits, deployments,
commits or full gates were run. The fake exercises actual dispatch argv and binding
with a loader-backed child observer; full next/run execution, systemd manager
integration, whole-repo strict checks and live runtime success remain unclaimed.
A valid roster changed in place between check and child is not snapshot-pinned by
this repair; current binding contract does not promise content immutability.
