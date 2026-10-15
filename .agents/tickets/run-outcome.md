+++
schema = 2
name = "run-outcome"
outcome = "every ended run carries a derived outcome (ok | no-change | verify-failed | timeout | refused) computed from the workspace diff, agx's verify results and the report, not from the worker's exit code alone; the report is parsed by one zod schema (summary, changes, checks, open, for_coordinator) and a string-wrapped or malformed report is recorded as malformed; `agx ls --json` and the router's run history use the derived outcome"
writes = ["tools/agx/src/next/**", "tools/agx/tests/next/**", "tools/*/.changes/*.md"]
verify = ["bun test tools/agx/tests/next", "mise run gate:land"]
timeout_s = 2400
premises = ["file:tools/agx/src/next/run.ts"]

[proposition]
id = "RUN-OUTCOME-DERIVED"
claim = "fixture runs that (a) change nothing, (b) change files but fail verify, (c) time out, (d) return a string-wrapped report, (e) succeed are recorded as no-change, verify-failed, timeout, malformed, ok respectively, and the router's history input reads that outcome"
refuted_by = "any of the five fixtures recorded as ok, or the router history still reading exit codes"
+++

Observed 2026-10-15: runs 1f5dda07, 0a4e6913 and two more changed nothing (the claude route could not run shell) yet
were recorded `ended exit=0`; until the coordinator rejected them the router's history counted them as successes.
Reports arrive in two shapes ({"summary":…} and {"exit_code":0,"result":"{…stringified…}"}). Ticket run-commit2 adds
commit_id/diff_stat on the ended event in parallel: use them if landed, otherwise compute the diff yourself and list the
overlap. Probe against a temp AGX_NEXT_STATE_DIR. Changesets via `mise run changeset`. Do not commit or push.

## Current state (coordinator agt_g67e, 17:30) — added acceptance evidence
coralbase observed run a2319ea5: timeout (exit 3, returned:false), report.json empty-shaped
({"summary":"","changes":[],...}), ls row state:"ended", changed_files:0, yet the workspace held 8 changed files:
changed_files is counted before any jj snapshot. Acceptance additionally requires: (f) a fixture timeout run whose
worker wrote files without running jj is recorded outcome=timeout with changed_files equal to the files written,
counted after the run-end snapshot (ticket run-commit2 adds that snapshot; if it is not on alpha, take the snapshot
yourself at the same point and list the overlap); (g) an empty-shaped report is "no report", not a successful one.
