+++
schema = 2
name = "fixture-modes"
outcome = "no test leaves a non-writable directory behind: (1) every disk-reclaim test that lowers a mode (d-tmpfs.test.ts:262 graveyard-fuyu 0555, b-purge.test.ts:107-108 0500, delete.test.ts:158-159 0555 and the mode loop at :175, independent/predicates.test.ts:154 and :190) restores owner write in a finally/afterEach; (2) the per-process test TMPDIR teardown in tools/shared/src/test-tmp.ts restores owner write recursively before removing, and if removal still fails it prints one warning naming the path, so any future test that forgets (1) still cleans up"
writes = ["lint/no-sync-baseline.tsv", "tools/disk-reclaim/tests/**", "tools/shared/src/test-tmp.ts", "tools/shared/tests/**", "scripts/lint-tmp-leaks.ts", "scripts/tests/lint-tmp-leaks*.test.ts", "tools/*/.changes/*.md"]
verify = ["bun test tools/disk-reclaim/tests", "bun test tools/shared", "mise run lint:ts"]
timeout_s = 1800
premises = ["file:tools/shared/src/test-tmp.ts", "file:tools/disk-reclaim/tests/targets/d-tmpfs.test.ts"]

[proposition]
id = "FIXTURE-MODES"
claim = "after `bun test tools/disk-reclaim/tests` the run's TMPDIR parent is gone and no directory without owner write remains under it; a fixture test that deliberately chmods 0555 and does not restore is still cleaned by test-tmp.ts teardown"
refuted_by = "any non-writable directory left after a test process exits"
+++

Incidents 2026-10-16 00:01 and 00:37 (fleet-wide): a disk-reclaim test fixture left graveyard-fuyu at 0555 inside an
agx run's temp dir; agx's stale-temp sweep then failed on EACCES and aborted every new agx run on the host (coralbase,
soks). agx is being fixed separately (agx-sweep-nonfatal: sweep failures become warnings). This ticket removes the
source. Tests must keep testing read-only behaviour; only their teardown changes. Test data outside the workspace.
Do not commit or push.

## Current state (coordinator — single current version)
Accepted on substance (your change lowered the no-sync count from 981 to 970). Land's lint:no-sync refuses one file:
"tools/shared/src/test-tmp.ts: 9 sync call(s), baseline 7 — new sync call". The two calls you added run in the
process-exit teardown, where only synchronous code runs; mark each `// sync-ok: process exit handler runs synchronously`
(or make it async if it is not on the exit path). Then `mise run lint:no-sync-baseline` must succeed (it lowers the
baseline to the new counts); include the regenerated lint/no-sync-baseline.tsv. Record `mise run hook:pre-commit` exit
code and last line in the checks field of your JSON return. Test data outside the workspace. Do not commit or push.

