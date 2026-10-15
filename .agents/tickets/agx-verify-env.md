+++
schema = 2
name = "agx-verify-env"
outcome = "agx runs a ticket's verify commands in the same explicitly assembled environment the worker had (PATH including the user's tool dirs such as ~/.cargo/bin and ~/.bun/bin, TMPDIR = the run's temp dir, the repo's mise env), not systemd's bare environment; and records each verify result with a kind: `passed`, `failed` (non-zero exit), `unrunnable` (exit 126/127: the command was not found or not executable — the check did not run), or `killed` (signal, e.g. 137), so `agx ls` and acceptance never read an unrunnable or killed verify as a code failure"
writes = ["tools/agx/src/next/run.ts", "tools/agx/src/next/outcome.ts", "tools/agx/src/next/store.ts", "tools/agx/src/next/verify*.ts", "tools/agx/tests/**", "tools/*/.changes/*.md"]
verify = ["bun test tools/agx/tests", "mise run lint:ts", "mise run lint:bun"]
timeout_s = 2400
premises = ["file:tools/agx/src/next/run.ts", "file:tools/agx/docs/scope.md", "file:tools/spec/architecture.md"]

[proposition]
id = "AGX-VERIFY-ENV"
claim = "fixtures: a verify `<bin> --help` whose bin lives only in a user tool dir passes under a unit-like bare environment; a missing command records kind=unrunnable with exit 127; a verify killed by SIGKILL records kind=killed with 137; a real failure records kind=failed; the worker and verify see the same PATH (asserted by a fixture that prints PATH in both)"
refuted_by = "a verify that cannot find a tool the worker used, or a 127/137 recorded as failed"
+++

Field reports (polysearch-v1-agt_f24v, 2026-10-16): ship13 run 7f00fad2 verify `polysearch-v1 --help` exited 127 because the
verify shell lacked ~/.cargo/bin while the worker's own checks passed; admitwarn 0eacbbb7 and integ14 56d8c51c verify
hooks ended 137 (SIGKILL). Every acceptance then had to choose between the author's claim and the record. Architecture:
I14 (the unit's environment is assembled explicitly by the entry point) and I6 (outcome from facts), tools/spec/architecture.md.
runVerify is at tools/agx/src/next/run.ts:127, called at :410. Read tools/agx/docs/scope.md first. Test data outside the
workspace. Do not commit or push.

## Current state (coordinator, 02:1x — single current version)
Your change was accepted; land's commit gate (`mise run typecheck`) refused tools/agx/tests/next/verify.test.ts:
(16,35) TS2769 No overload matches this call; (26,27) TS2769; (27,16) TS2339 Property 'future' does not exist on type
'{ cmd; exit; log_path; kind: "failed" | "killed" | "passed" | "unrunnable" }'; (36,12) TS2769.
Fix the test's types (no `as` casts; the lint bans them), then run `mise run typecheck`, `mise run lint:ts` and
`mise run lint:bun` until all are clean. Everything else stays. Test data outside the workspace. Do not commit or push.

