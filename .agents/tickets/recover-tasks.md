+++
schema = 2
name = "recover-tasks"
outcome = "scripts/wsl-capacity-recover.ts only invokes commands that exist: today it runs `mise run reclaim:host -- --execute`, `reclaim:builds` and `reclaim:clean` (wsl-capacity-recover.ts:677-679) but mise.toml declares only `reclaim` and `reclaim:yes`; each stage calls an existing entry (a declared mise task or the disk-reclaim CLI directly with explicit targets), and a test fails whenever a task/command the controller names is not declared"
writes = ["scripts/wsl-capacity-recover.ts", "scripts/tests/wsl-capacity-recover*.test.ts", "mise.toml", "tools/*/.changes/*.md"]
verify = ["bun test scripts/tests", "mise run gate:land"]
timeout_s = 2400
premises = ["file:scripts/wsl-capacity-recover.ts", "file:mise.toml"]

[proposition]
id = "RECOVER-CALLS-EXIST"
claim = "every task or command named by wsl-capacity-recover.ts resolves on this checkout (test enumerates them against `mise tasks`), and a fixture run under host pressure executes each stage instead of failing on a missing task"
refuted_by = "a stage whose command does not exist, or a test that passes while a named task is undeclared"
+++

Retro: /home/fuyu/Workspace/retrospectives/2026-10-15-self-recovery-contradiction-retro.md (RC2, I-R2).
The recover unit runs every minute (wsl/wsl-capacity-recover.service.wsl). A failing stage must exit non-zero (systemd
records it). Never delete anything in a live run on this host. Do not edit scripts/guest-capacity-recover.ts (ticket
self-heal), tools/statusline or scripts/doctor.ts (ticket recover-health). Test data under TMPDIR. Do not commit or push.

## Current state (coordinator, 00:1x — single current version)
Your latest run (5d48e660) still fails your own test: `WSL capacity recovery names only commands that exist >
every task, script, and disk-reclaim target the controller names resolves` — the controller still names something
that does not resolve (on 10-15 it named `reclaim:host`, `reclaim:builds`, `reclaim:clean`; mise declares only `reclaim`
and `reclaim:yes`). Make the controller call only existing entries, or declare the tasks it needs in mise.toml, until
that test passes. Ignore these baseline/stale-base failures: changeset `relay`/`Markdown formatter`, `skills:sync`,
doctor `smart-open:*`. Test data outside the workspace. Do not commit or push.
