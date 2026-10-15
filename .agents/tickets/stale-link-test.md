+++
schema = 2
name = "stale-link-test"
outcome = "the test 'real TypeScript checking sees workspace types through a stale consumer link without writing it' (tools/agx-usehooks/tests/consumers.test.ts:57) passes on current alpha and in a fresh jj workspace, or, if its premise no longer holds, is rewritten so it tests the current contract; `bun test tools/agx` (which includes it) is green on alpha"
writes = ["tools/agx-usehooks/**", "tools/*/.changes/*.md"]
verify = ["bun test tools/agx-usehooks/tests/consumers.test.ts", "bun test tools/agx", "mise run gate:land"]
timeout_s = 1800
premises = ["file:tools/agx-usehooks/tests/consumers.test.ts"]

[proposition]
id = "STALE-LINK-TEST-GREEN"
claim = "the test passes on alpha and in a fresh workspace without writing the consumer link, and still fails if the code under test is broken (show one mutation that makes it fail)"
refuted_by = "the test still fails on alpha, passes only by being skipped or weakened, or writes the consumer link"
+++

Observed 2026-10-15: this test fails on alpha 261f241e and in every agx workspace since (runs 201e5353, 04ea864a,
manual checks); it is the only failure in `bun test tools/agx` (256 pass, 1 fail), so every agx ticket's verify fails
on it and each acceptance needs a manual "also fails on alpha" check. Find why (fixture assumption about the workspace
layout or consumer link, environment, or a real regression), fix the cause, and say which it was. Do not skip it.
Changesets via `mise run changeset` (MISE_TRUSTED_CONFIG_PATHS=$PWD MISE_STATE_DIR=$(mktemp -d)). Do not commit or push.

## Current state (coordinator, 23:25)
The previous run (0d251b97) left this workspace with failing verify. Its first failing lines:
FAIL fixture: workspace /tmp/usehooks-consumer-Zkpbtg/workspace; tsc exit 0
(fail) real TypeScript checking sees workspace types through a stale consumer link without writing it [47933.10ms]
(fail) agx > external SIGTERM forwards to codex and gives it time to finish [1093.23ms]
(fail) (unnamed) [0.57ms]
(fail) agx-next run > routes through Jev, starts a worker, and records its report [15051.63ms]
(fail) agx-next run > runs ticket verification in order and records every exit and log [5155.67ms]
(fail) agx-next run > imports sampled real legacy line shapes once [5043.62ms]
(fail) agx-next run > ignores unknown record fields and bounds human ls without changing JSON order [5084.43ms]
(fail) agx ls selects an id prefix and an exact ticket with newest last [5225.94ms]
(fail) ls --running combines with JSON, all and selector; cached liveness is refreshed [5064.74ms]
Continue from the workspace as it stands: fix these without disabling rules, re-run verify. A failure in
"stale consumer link" is a known pre-existing test failure owned by another ticket; ignore only that one.
config-map findings on zero-byte sandbox placeholder files (.claude/launch.json and peers) are removed by the
coordinator before land; ignore only those. Test data outside the workspace. Do not commit or push.
