+++
schema = 2
name = "graveyard-auto"
outcome = "the rip graveyard stays under its limit without a human: `mise run doctor` (2026-10-16 10:0x) reports '/home/fuyu/.local/share/graveyard is at least 27315636835 bytes; limit is 10737418240' with fix 'run mise run reclaim', although disk-reclaim has a rip-expire stage (tools/disk-reclaim, reclaim-fix 7583ef6a) and self-heal 39bc44c8 plus wsl-capacity-recover run on timers; find why no timer-driven path expires the graveyard (not scheduled, scheduled but skipped, 24 h age rule leaves 27 GB of fresh entries, or a failure), name it with file:line and journal evidence, and fix it so the graveyard is bounded by the declared limit automatically (age rule plus a size cap that expires oldest-first when over the limit)"
writes = ["tools/disk-reclaim/src/**", "tools/disk-reclaim/tests/**", "tools/disk-reclaim/.changes/*.md", "scripts/wsl-capacity-recover.ts", "scripts/tests/wsl-capacity-recover*.test.ts", "mise.toml"]
verify = ["bun test tools/disk-reclaim", "mise run lint:ts", "mise run typecheck", "mise run lint:no-sync"]
timeout_s = 2400
premises = ["file:tools/disk-reclaim/src/engine.ts"]

[proposition]
id = "GRAVEYARD-BOUNDED"
claim = "the cause is named with file:line and journal lines; a test with a fixture graveyard over its size limit and entries younger than 24 h shows the timer path expiring oldest-first until under the limit; a dry-run of the timer path on this machine (`reclaim` plan, no apply) lists graveyard expiry"
refuted_by = "a graveyard over its limit after the timer path runs in the test, or a cause without evidence"
+++

Read `systemctl --user list-timers` and the journals of the capacity units. Do not apply deletions on this machine; dry
runs only. Add no sync calls. Do not rebase; land rebases. Record `mise run hook:pre-commit` exit code and last line in the
checks field of your JSON return. Test data outside the workspace. Do not commit or push.

## Current state (coordinator — single current version, after 3d7c6118 landed)
Live probe after deploy (wsl-capacity-recover run 12:2x JST): GRAVEYARD EXPIRE totals {"reclaim":0,"ask":13181,"keep":0},
{"reclaim_bytes":0,"ask_bytes":255835356082,"freed_bytes":0}; `du -sb ~/.local/share/graveyard` = 134465329517 (limit
10 GiB). The process-use guard is gone, but every entry is now classified ASK, and the unattended timer path never applies
ASK, so nothing is freed. Required: on the timer path, graveyard entries selected by the size cap (oldest first until the
total is under the limit) and by the age rule are RECLAIM, not ASK — rip already asked the human once when it moved them.
Acceptance is the live run: after your change lands and deploys, one timer run must free at least (size - limit) bytes;
your own check before return is a dry-run plan on this machine whose reclaim_bytes >= (current size - limit) and
ask_bytes for graveyard entries = 0. Do not apply on this machine yourself.

