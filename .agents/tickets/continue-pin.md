+++
schema = 2
name = "continue-pin"
outcome = "`agx run <ticket> --continue <run>` never routes: it reuses the prior run's row (route, model, effort) and resumes that run's recorded vendor session; if the prior run has no recorded vendor session, or its route is unavailable, agx refuses before starting anything (exit 2) with one line naming the run and suggesting a fresh `agx run <ticket>`; the started event records continued_from and the pinned row"
writes = ["scripts/config-registry.ts", "tools/agx/src/next/run.ts", "tools/agx/src/next/continue.ts", "tools/agx/tests/next/continue*.test.ts", "tools/*/.changes/*.md"]
verify = ["bun test tools/agx/tests/next", "mise run gate:land"]
timeout_s = 1800
premises = ["file:tools/agx/src/next/run.ts"]

[proposition]
id = "CONTINUE-PINS-ROW"
claim = "fixtures: continuing a codex run while the router would now prefer a claude row resumes on the same codex row; continuing a run with no vendor session exits 2 before any worker starts; continuing a claude run resumes its claude session; the ticket file is re-read on continue"
refuted_by = "a continue that calls the router, switches route, or starts a worker without a resumable session"
+++

Observed today across firedancer, coralbase, soks and dotfiles: continues fail with "No conversation found with session
ID" (3e66a238→e19c1aa3, 01654343→e707c405, 52e51780→134420bf at 18:xx with no roster override) or "has no vendor
session to continue" (sdk-layer f089600d, walrus 21eb1a84). Cause: --continue re-routes, and since usage-aware routing
(757734f5) prefers claude, a codex run's continue lands on a claude row that cannot resume a codex session.
Keep the change minimal and isolated in the continue path (ticket run-outcome2 edits tools/agx/src/next/** in
parallel; touch run.ts only where the continue branch calls the router, and list the lines). Also record the vendor
session on the claude route if it is missing today (soks: vendor_session null while the report held session_id).
Probe against a temp AGX_NEXT_STATE_DIR. Changesets via `mise run changeset`. Do not commit or push.

## Current state (coordinator, 21:48)
The code is accepted in substance (31/31 tests). Land's commit gate rejected it at lint:ts:
tools/agx/tests/next/continue.test.ts lines 111, 112, 130, 146, 181 — `a throwing .parse(...) is banned (zod first):
use .safeParse(...) and handle the failure as a value`. Fix exactly these, run `mise run lint:ts` until clean, re-run
verify. The coordinator removed 19 zero-byte Claude sandbox stub files (.bashrc, .claude/*, .gitconfig, ...) from
this workspace; if they reappear, do not stage or rely on them.
