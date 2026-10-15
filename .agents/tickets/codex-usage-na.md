+++
schema = 2
name = "codex-usage-na"
outcome = "the statusline's codex 7d usage read succeeds whenever a fresh source exists: the owner reports `codex: n/a` 'しょっちゅう' (often) on the Rate line (2026-10-16); find which read path the statusline uses for codex usage (tools/shared/src/codex-subscription-usage.ts or another), record each failure reason over a sample (run the read 30 times across 5 minutes under the current load and tabulate reason codes), name the cause with file:line, and fix the read so the failure rate drops to zero when a rollout usage event newer than 7 days exists; router-prompt (landing now) already made agx's own codex read stay fresh across consecutive reads — reuse that, do not fork a second reader"
writes = ["tools/shared/src/codex-subscription-usage.ts", "tools/shared/tests/**", "tools/statusline/src/rate*.ts", "tools/statusline/src/codex*.ts", "tools/statusline/tests/rate*.test.ts", "tools/statusline/tests/codex*.test.ts", "tools/*/.changes/*.md"]
verify = ["bun test tools/shared", "mise run lint:ts", "mise run typecheck", "mise run lint:no-sync"]
timeout_s = 2400
premises = ["file:tools/shared/src/codex-subscription-usage.ts"]

[proposition]
id = "CODEX-USAGE-READ"
claim = "the return has the before/after failure table (30 reads each, reason codes) with after = 0 non-timeout failures while a recent rollout event exists, and p50/p95 latency before and after; the cause is named with file:line; one reader serves both agx and the statusline"
refuted_by = "any failure in the after sample with a recent event present, or two separate codex usage readers"
+++

The display contract (keep the last value with its age) is ticket statusline-agx-sticky, running in parallel; do not edit
the statusline's rendering. Add no sync calls. Do not rebase; land rebases. Record `mise run hook:pre-commit` exit code and
last line in the checks field of your JSON return. Test data outside the workspace. Do not commit or push.

## Current state (coordinator — single current version)
Your stop was right: the unified reader is correct but much slower (before p50 9 ms / p95 30 ms; after p50 259 ms /
p95 1117 ms). Keep its correctness (it must find rate data even when the newest rollout has none) and make it fast:
read rollouts newest-first by mtime, stop at the first one that has rate data, read each file from its end (rate events
are appended), and cache the result keyed by (path, mtime, size) so an unchanged source is not re-read. Acceptance: p95
within 2x of the old reader (<= 60 ms) on the same 30-read sample, zero non-timeout failures, the old single-rollout miss
still covered by a test, lint and `mise run hook:pre-commit` pass.

