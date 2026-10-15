+++
schema = 2
name = "agx-no-orphan"
outcome = "`orphaned` stops being a resting state of an agx run: today the statusline shows `orphaned 10`, and runs become orphaned when their owner dies without an end record (e.g. the coordinator's `systemctl --user stop agt_<slug>` with KillMode=mixed sends SIGTERM, and tools/agx/tests/next/workspace-lock.test.ts:297 shows SIGKILL folding a run as orphaned); make the run record a closed union — running{lease} | ended{outcome} — where every exit path produces an ended record with a typed outcome: SIGTERM/SIGINT/SIGHUP are trapped and write ended{outcome: 'stopped', signal}; a lost owner (SIGKILL, OOM, host reboot) is derived by the fold from the lease (pid + start time, and the systemd unit's Result when the run had one) as ended{outcome: 'lost', evidence} at read time, without writing anything, so no reader ever returns `orphaned`; the TypeScript type of a stored or listed run has no orphaned variant (the compiler rejects code that produces one), and legacy orphaned records are migrated on read"
writes = ["tools/agx/src/**", "tools/agx/tests/**", "tools/agx/docs/**", "tools/statusline/src/dispatch-runs.ts", "tools/statusline/tests/**", "tools/*/.changes/*.md"]
verify = ["bun test tools/agx/tests", "mise run lint:ts", "mise run typecheck", "mise run lint:no-sync"]
timeout_s = 3000
premises = ["file:tools/agx/docs/scope.md", "file:tools/agx/tests/next/workspace-lock.test.ts"]

[proposition]
id = "AGX-NO-ORPHAN"
claim = "tests: SIGTERM to a running agx run yields ended{stopped}; SIGKILL yields ended{lost} in `agx ls` (derived; the records file is unchanged by ls); a legacy orphaned record lists as ended{lost}; `agx ls --json` over the real state dir returns zero records with state orphaned; a type test (ts-expect-error is banned, so use a compile fixture run by tsc in the test) shows constructing an orphaned run state fails to compile"
refuted_by = "any code path or test that lists a run as orphaned, or any write by ls / ls --wait"
+++

Read tools/agx/docs/scope.md first; stay within it (no wait/detach/land features). `--continue` of an ended{stopped}
run without a vendor session must say so and print the fresh-start command (firedancer D2), not exit with only a journal
line. Add no sync calls. Do not rebase; land rebases. Record `mise run hook:pre-commit` exit code and last line in the
checks field of your JSON return. Test data outside the workspace (never the shared agx state dir for writes; read-only
`agx ls --json` over it is the live probe). Do not commit or push.

## Current state (coordinator decision — single current version)
Your stop was right: my brief contradicted scope.md (ls and ls --wait are read-only folds). Decision: keep them
read-only. `lost` is a derived outcome, computed by the fold from lease evidence each time; only `agx run` writes
(the SIGTERM/SIGINT/SIGHUP trap writes ended{stopped}). The closed type applies to the listed/folded run, not to stored
events. scope.md gets one line saying so.

