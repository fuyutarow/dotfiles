+++
schema = 2
name = "agx-ls-wait-latest"
outcome = "`agx ls --wait <ticket>` waits for the next end of that ticket: it ignores runs that were already ended or orphaned when the call started and returns the first selected run that ends after the call (or, if the ticket has a running run, when that run ends); `--wait` with a run id keeps today's behaviour; still a read-only fold with no state"
writes = ["tools/agx/src/next/cli.ts", "tools/agx/src/next/commands.ts", "tools/agx/src/next/wait*.ts", "tools/agx/tests/**", "tools/agx/docs/scope.md", "tools/*/.changes/*.md"]
verify = ["bun test tools/agx/tests", "mise run lint:ts", "mise run lint:bun", "mise run typecheck"]
timeout_s = 1800
premises = ["file:tools/agx/src/next/cli.ts", "file:tools/spec/architecture.md"]

[proposition]
id = "AGX-WAIT-NEXT"
claim = "fixtures: a ticket with an old ended run and a running run → --wait returns only when the running run ends; a ticket with only old ended runs → --wait blocks until a new run of that ticket ends; a run-id selector on an ended run returns at once"
refuted_by = "--wait <ticket> returning a run that had ended before the call"
+++

Incident 2026-10-16 08:2x: `agx ls --wait self-heal` returned at once with an older ended run (8ed2b5f3), so the R1 tool
could not wake the coordinator by ticket name. Retro: /home/fuyu/Workspace/retrospectives/2026-10-16-coordinator-idle-overnight-retro.md
(I-W2). Test data outside the workspace. Do not commit or push.
