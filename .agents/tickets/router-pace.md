+++
schema = 2
name = "router-pace"
outcome = "subscription pace is applied by code, not only by the picker model's prompt: after Jev returns row probabilities, agx re-weights them deterministically from the fresh usage snapshot — among capability-eligible comparable rows (same capability band), the route with the most negative fresh-window pace is preferred and a positive-pace route is excluded when the other route has a comparable row; stale or unknown usage stays neutral; the pick_audit records the probabilities before and after the pace step and which rule changed them; and the codex usage read no longer flips to `unknown` between consecutive picks when the source is fresh (find why it did and fix it, or record the reason in the audit)"
writes = ["tools/agx/src/next/route.ts", "tools/agx/src/next/usage.ts", "tools/agx/src/next/pace*.ts", "tools/agx/tests/**", "tools/*/.changes/*.md"]
verify = ["bun test tools/agx/tests", "mise run lint:ts", "mise run lint:bun", "mise run typecheck"]
timeout_s = 2400
premises = ["file:tools/agx/src/next/route.ts", "file:tools/agx/src/next/usage.ts", "file:tools/agx/docs/scope.md"]

[proposition]
id = "ROUTER-PACE-CODE"
claim = "fixture from 2026-10-16 08:4x: claude 5h used 12% at 85% elapsed (pace -0.72), codex 7d used 34% at 11% elapsed (pace +0.23), Jev probabilities sol-medium 0.73 / sonnet-medium 0.06 → after the pace step the pick is a claude row of the same band; with codex usage unknown the step leaves probabilities unchanged; the audit shows before/after"
refuted_by = "a codex row picked over a comparable claude row while codex pace is positive and claude pace is negative on fresh usage"
+++

Field evidence (pick_audit of preset-cargo, preset-latex, preset-ts-ref, 2026-10-16 08:4x): all three picked sol-medium
with probabilities 0.59-0.74 although claude's 5h window was 85% elapsed at 12-13% used and codex 7d was over pace;
in two of the three snapshots codex usage was `unknown`. The pace rule currently lives only in the picker instructions
(route.ts:96) — a rule enforced by prose, like the deleted no-sync rule. Read tools/agx/docs/scope.md first. Continue
runs keep their row (continue-pin, I13) and are out of scope. lint:no-sync is on alpha. You cannot rebase in the
sandbox. Definition of done: `mise run hook:pre-commit` exits 0; paste its last 5 lines. Test data outside the workspace.
Do not commit or push.

## Current state (coordinator decision — single current version)
You correctly stopped: scope.md says Jev picks and agx never overrides the pick. Decision (option A, keeps scope.md):
agx does NOT re-weight or replace Jev's choice; instead, BEFORE calling Jev, it removes from the candidate rows those
that the pace rule excludes (a row on a positive-pace route when the other route has a capability-comparable row and
fresh usage), and records in pick_audit which rows were withheld and why. Jev still picks among the rest. Define
"capability-comparable" from the roster data (same band/effort tier, e.g. sol-medium ~ sonnet-medium), not from prose.
Stale/unknown usage withholds nothing. Also find why codex usage reads `unknown` intermittently. Record the
hook:pre-commit exit code and last line in the checks field of your JSON return.

