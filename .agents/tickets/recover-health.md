+++
schema = 2
name = "recover-health"
outcome = "a broken recoverer is visible within one minute: the statusline shows a red segment and `mise run doctor` FAILs when the last run of wsl-capacity-recover.service (and guest-capacity-recover.service when installed) ended FATAL, timed out, or exited non-zero, or when a drive stays below its warn line across consecutive runs; healthy runs add nothing to the statusline"
writes = ["tools/statusline/src/**", "tools/statusline/tests/**", "scripts/doctor.ts", "scripts/doctor-*.ts", "scripts/tests/doctor*.test.ts", "tools/*/.changes/*.md"]
verify = ["bun test tools/statusline", "bun test scripts/tests/doctor.test.ts", "mise run gate:land"]
timeout_s = 2400
premises = ["file:tools/statusline/src", "file:scripts/doctor.ts"]

[proposition]
id = "RECOVER-HEALTH-VISIBLE"
claim = "fixture: a recover unit whose last result is FATAL (e.g. the 10-15 `TMPFS_RECLAIM_PERCENT must be an integer from 1 to 84`), a timeout (exit 143), or reclaimed=0 below warn renders red in the statusline and makes doctor FAIL with the unit name and the journal line; a healthy HOLD renders nothing"
refuted_by = "a failed recover unit that leaves the statusline unchanged or doctor passing"
+++

Retro: /home/fuyu/Workspace/retrospectives/2026-10-15-self-recovery-contradiction-retro.md (RC4, I-R3): on 10-15 the
recover unit logged 61 FATALs (10:54-15:57) and two timeouts with 0 reclaimed (20:30, 20:37) and nobody saw it.
Read the unit's state with systemctl/journalctl (read-only); the statusline must never block on it (use the existing
render cache pattern). Do not edit the recover scripts (tickets recover-tasks, self-heal). Test data under TMPDIR.
Do not commit or push.

## Current state (coordinator, 00:1x — single current version)
Your latest run (47a1ac57) adds one failure that alpha does not have: `renders a 7d only window and integer
credits` (statusline rate-limit rendering). Your statusline change must not alter the rate-limit segment; restore it.
Ignore these baseline/stale-base failures: statusline `VRAM`, `snapshot … n/a`, `Run activity comes from the vendor
Codex rollout`, `Job displays …` (load flake), doctor `smart-open:*`, `skills:sync`, changeset `relay`.
Test data outside the workspace. Do not commit or push.
