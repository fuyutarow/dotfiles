+++
schema = 2
name = "statusline-design"
outcome = "the statusline run area matches its design: (1) the count of dead-but-unended runs uses agx's own word and fold (`orphaned`, from agx's store fold), and counts only runs that are orphaned and younger than a stated window or not yet acknowledged, so it returns to 0 instead of growing all night (today `stale 62`); the exact rule is stated in a code comment and a test; (2) claude-route run rows show progress from the run's worker-progress.jsonl (written today at tools/agx/src/next/run.ts:337-338): last tool/command, count, files touched, cost when known, instead of `$– · no event yet`; (3) the `Job:` line has one format for every session (name + elapsed), e.g. today one session shows `cpu+1 0m22s` and another `job2610-modtest-gpu-3g 0m32s` for the same host"
writes = ["tools/statusline/src/dispatch-runs.ts", "tools/statusline/src/agx-snapshot.ts", "tools/statusline/src/jobs*.ts", "tools/statusline/src/job*.ts", "tools/statusline/tests/**", "tools/*/.changes/*.md"]
verify = ["bun test tools/statusline", "mise run lint:ts", "mise run lint:bun"]
timeout_s = 2400
premises = ["file:tools/statusline/src/dispatch-runs.ts", "file:tools/agx/src/next/run.ts"]

[proposition]
id = "STATUSLINE-RUN-AREA"
claim = "fixtures: 62 orphaned runs older than the window render no count; one fresh orphan renders `orphaned 1`; a claude run with a worker-progress.jsonl renders its last command and counts; two Job sources render in the same name+elapsed format"
refuted_by = "a count that only grows, a claude row showing `no event yet` while its progress file has events, or two formats for the Job line"
+++

Owner question 2026-10-16 01:10: "これは期待されている statusline 設計ですか？" — coordinator's answer listed S3 (stale grows, word differs
from agx's `orphaned`), S4 (claude progress not wired although written), S5 (Job line formats differ). Do not touch the Sys
line (tickets statusline-tmpfs and recover-health own those segments). Read agx's fold, do not reimplement it: the
statusline must not hold a second definition of a run's state. Baseline failures on alpha you may ignore: `VRAM > no
nvidia-smi is stated`, `snapshot … n/a`, `Run activity comes from the vendor Codex rollout`. Test data outside the
workspace. Do not commit or push.
