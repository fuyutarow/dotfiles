<!-- Consumer repository names and historical path components below are anonymized; example-* labels are not live source locators. -->

# AGX suite caller inventory — 2026-10-19

Read-only search of the workspace, registered repositories (`scripts/workspace-repos.ts`), and the rendered global CLAUDE.md. Includes command argv arrays, executable callers, tests, documentation, and historical records; a match is not a claim that a historical instruction is executed. The accepted interfaces are `agx worker|ticket|ws ARGS` and `agx-worker|agx-ticket|agx-ws ARGS`. Old top-level verbs, `agx-next`, `agx-run`, `agx jev`, `agx-worker jev`, and the bare `ws` / `tkt` bins are removed. `jex` owns the Jev client interface.

Query: `\bagx[ \t]+(run|dispatch|check|ls|judge|stats|roster|doctor)\b|["']agx["'][ \t]*,[ \t]*["'](run|dispatch|check|ls|judge|stats|roster|doctor)["']|\bagx-run\b`

Raw output, including snippets and pre-edit matches: `/tmp/agx-suite-callers.json`. Entries below list every matched file and line; a count means matched lines, not invocations. The pre-edit workspace inventory is retained so moved callers are not lost.

The previously inventoried external DX caller declared `["agx", "jev"]`; that external repository is outside this checkout. This repository no longer provides either Jev command; use `jex`.

## Before rename: /home/fuyu/dotfiles.ws/ws_agx-suite-thin

- `README.md:108,141,149,150,154,183,214,215,219,222`
- `tools/spec/agx-ticket.md:4,11,67,69,90,101,107`
- `tools/spec/architecture.md:44,49,61,62,63,64,65,66,67,81,82,84,85,102,119,120,122,123,127,130,131,133,226,248,261`
- `tools/spec/agx-ws.md:37,42,43,82,113,133,135,136,137,138`
- `archives/skills/operating-the-harness/SKILL.md:29` (retired historical source)
- `agents/skills/writing-bun-scripts/tests/cleye-corpus.test.ts:22,23,86`
- `package.json:25,26`
- `tools/agx/tests/doctor.test.ts:136,149,166,385,386,387,398,553,680,684,687,691`
- `tools/agx/tests/suite-entry.test.ts:49,56,57,58,59,74,87`
- `tools/agx/README.md:11,14,23,33`
- `tools/agx/src/agx.ts:4,31`
- `tools/agx/src/doctor.ts:15,71,86,91,97,109`
- `tools/agx/src/dispatch.ts:28,146,151,196,204,215,224,234,245,257,268,277,283,295,303,337,358,365,379,400`
- `tools/agx/CHANGELOG.md:22`
- `tools/agx-ticket/src/tickets.ts:398,562`
- `tools/detect-japanese/tests/classify.test.ts:63`
- `tools/agx-run/tests/next/entrypoint.test.ts:4,5,8,10,16,19,21,26`
- `tools/agx-run/tests/next/workspace-lock.test.ts:108,150,318,414,437`
- `tools/agx-run/tests/next/incremental-fold.test.ts:207,238`
- `tools/agx-run/tests/next/run-temp.test.ts:46,99`
- `tools/agx-run/tests/next/no-orphan.test.ts:40,119`
- `tools/agx-run/tests/next/ticket-home.test.ts:26`
- `tools/agx-run/tests/next/ls-selector.test.ts:96,107`
- `tools/agx-run/tests/next/route.test.ts:257`
- `tools/agx-run/tests/next/lost-race.test.ts:153`
- `tools/agx-run/tests/next/run.test.ts:42,72,242,307,321,342,372,407,481,530,597,609,651,681,710,734,788,827,866,941,949,952,959,978`
- `tools/agx-run/tests/next/wait-cursor.test.ts:160`
- `tools/agx-run/tests/next/fixtures/lost-race-records.jsonl:3`
- `tools/agx-run/tests/next/fixtures/legacy-real-shapes.jsonl:1`
- `tools/agx-run/tests/next/outcome.test.ts:76,106`
- `tools/agx-run/tests/next/ls-wait.test.ts:70`
- `tools/agx-run/tests/next/continue.test.ts:85,139,189`
- `tools/agx-run/tests/suite-layout.test.ts:6,8,9,10,15,16`
- `tools/agx-run/tests/ticket.test.ts:30,165,166`
- `tools/agx-run/src/next/continue.ts:22`
- `tools/agx-run/src/next/cli.ts:37,55,58,72,84,106,124,164,188,208,224,241`
- `tools/agx-run/src/next/store.ts:125`
- `tools/agx-run/src/next/run.ts:835`
- `tools/agx-run/src/next/wait.ts:62,98`
- `tools/agx-run/src/next/public.ts:12,20,31,35,41,51`
- `tools/agx-run/src/next/doctor.ts:16,26`
- `tools/agx-run/src/workers/codex.ts:11,146,147`
- `tools/agx-run/src/workers/codex-progress.ts:2`
- `tools/agx-run/src/temp.ts:18`
- `tools/agx-run/src/ticket.ts:10,11,296`
- `tools/agx-run/contract.md:3,8,9,10,11,12,14,17,20,35,44`
- `tools/agx-run/CHANGELOG.md:5,74,130,146,154,177,187,191,193,197,254,398`
- `tools/agx-run/package.json:3,7,8`
- `tools/agx-run/docs/next-records.md:1,3,5,9,10,12,13,18,19,20,24,26,78,91,112,144,150,158,167,174,175`
- `tools/agx-run/docs/scope.md:1,3,7,9,13,44,46,50,51,52,53,54,55,56,57,58,59,60,65,78,82`
- `tools/agx-run/docs/ref-writer-inventory.md:78,79,80,81,82,83,84`
- `tools/statusline/tests/fleet-line.test.ts:161`
- `agents/codex/AGENTS.md:11`
- `agents/models/tests/roster.test.ts:208,209,210,211,212,216`
- `tools/statusline/tests/fixtures/agx-ls-sample.json:18,36,37,38,44,123,204,249,280,311,333,359,389,422,444,510,583,625,647,669,686,691,722,767,804,809,860`
- `lint/no-sync-baseline.tsv:60,61,62,63,64,65,66,67,68,69,70,71,72,73`
- `mise.toml:29,440`
- `tools/statusline/tests/worker-rows.test.ts:9`
- `tools/statusline/README.md:108,220,235,237`
- `tools/statusline/src/dispatch-runs.ts:51,152`
- `tools/statusline/src/fleet-line.ts:3`
- `tools/statusline/src/dispatch-display.ts:147`
- `tools/statusline/src/agx-snapshot.ts:74`
- `tools/statusline/src/dataframe.ts:60`
- `tools/statusline/CHANGELOG.md:50`
- `tools/storage-headroom/tests/decision.test.ts:522`
- `tools/shared/tests/fixtures/active-markers.ts:19`
- `tools/shared/src/test-tmp.ts:188`
- `tools/shared/CHANGELOG.md:9`
- `tools/statusline/tests/statusline-run-row.test.ts:33,292,495,1339`
- `tools/agx-ws/src/workspace.ts:660,663,668,1999,2171`
- `.agents/tickets/agxlsfold.md:4,12,16`
- `.agents/tickets/run-outcome2.md:4`
- `.agents/tickets/agx-snapshot-hook.md:4`
- `.agents/tickets/agx-tmp2.md:4`
- `.agents/tickets/naming-display.md:12`
- `.agents/tickets/workspace-tool.md:18`
- `.agents/tickets/gitlockport2.md:12,13,39`
- `.agents/tickets/runcommit2.md:4,22`
- `.agents/tickets/agx-verify-env.md:4`
- `.agents/tickets/continue-pin.md:4`
- `.agents/tickets/facts-agx.md:20,21,24`
- `.agents/tickets/runslug.md:13,17,27,45`
- `.agents/tickets/facts-tools.md:19`
- `.agents/tickets/agx-overrun.md:4,17`
- `.agents/tickets/gitlockport.md:12,13,39`
- `.agents/tickets/triage-unlanded.md:4,16,17`
- `.agents/tickets/tmp-leaks.md:4,13`
- `.agents/tickets/agx-no-orphan.md:4,12,20,24`
- `.agents/tickets/agx-ticket-home.md:4`
- `.agents/tickets/agx-ls-wait-latest.md:4,16`
- `.agents/tickets/agx-sweep-nonfatal.md:4,16`
- `.agents/tickets/admit.md:19,24`
- `.agents/tickets/tkt.md:4,12`
- `.agents/tickets/stale-link-test.md:28,29,30,31,32`
- `.agents/tickets/statusflap.md:4,13,23,29,36`
- `.agents/tickets/run-outcome.md:4`
- `.agents/tickets/gitlock.md:12,13,39`
- `.agents/tickets/jjsafe.md:29`
- `.agents/tickets/agx-tmp.md:4`
- `.agents/tickets/landpipe.md:4,22,25,29,34`
- `.agents/tickets/fixture-modes.md:17`
- `.agents/tickets/agx-ls-wait.md:4`
- `.agents/tickets/jjsafe2.md:29`
- `.agents/tickets/agx-one-run-per-ws.md:4,12,23`
- `.agents/tickets/runcommit.md:4,22`
- `agents/hooks/tests/enforce-search-route.test.ts:280,281,298,299,300,317,318,319,320,322,323,324,325,326,327,328,329,348,350,382`
- `agents/hooks/tests/search-route.syntax.test.ts:46,47`
- `agents/hooks/storage-headroom.contract.md:17`
- `tools/disk-reclaim/tests/targets/d-tmpfs.test.ts:71`
- `agents/skills/driving-antigravity/SKILL.md:24,25,188,189,195,215,217`
- `agents/skills/wiring-mise-tasks/SKILL.md:78`
- `agents/skills/orchestrating-agents/SKILL.md:83,360`
- `agents/skills/orchestrating-agents/references/model-roster.md:22,26`
- `scripts/tests/agx-host.test.ts:13`
- `scripts/tests/doctor.test.ts:113`
- `scripts/tests/tracked-files.test.ts:120,121`
- `scripts/tests/render-home.test.ts:263,264,265,266,267,268,269,270,565,572,573,574,575,576,577,578`
- `scripts/tests/agx-accept.test.ts:123,155,157`
- `scripts/tests/deploy-characterization/inventory.path-line.txt:152,156`
- `scripts/tests/statusline-owners.test.ts:79,82,85`
- `systemd/agx-doctor.service:13`
- `scripts/tests/land.test.ts:239,241,242,245,248,437,439,441,442,445,446,449,474,482,509,518,1001,1124,1126,1215,1224,1238`
- `scripts/agx-host.ts:13`
- `scripts/link-dots.ts:889`
- `scripts/doctor-remote.ts:132`
- `tools/jex/README.md:23,54,58,63`
- `agents/claude/README.md:43`
- `agents/claude/agents/sonnet-medium.md:5`
- `agents/claude/agents/sonnet-high.md:6`
- `agents/claude/hooks/tests/enforce-background-waits.test.ts:285,340`
- `agents/claude/hooks/tests/enforce-dispatch-contract.test.ts:10,53,58,59,60,61,62,64`
- `agents/claude/hooks/tests/bash-durations.test.ts:36`
- `agents/claude/hooks/tests/dispatch-contract.diagnostic-card.md:14,15,16,19,20,22`
- `agents/models/dispatch-roster.contract.md:6,12,14,15,16,17,18,19,20,21,27`
- `agents/claude/hooks/enforce-background-waits.ts:24`
- `agents/models/dispatch-roster.toml:3,5,6`
- `agents/claude/hooks/log-agx-snapshot.ts:10,46,47`
- `agents/claude/hooks/enforce-dispatch-contract.ts:2,6,24,48,49,50,51`
- `agents/claude/hooks/bash-durations.ts:9`
- `agents/claude/CLAUDE.md:11,12,13,18,21`
- `scripts/lint-bun.ts:29,30`
- `scripts/config-registry.ts:501,683`
- `scripts/land.ts:128,130,134,139,147,164,901,1007,1062,1064,1065`
- `CLAUDE.md:49,117,118`
- `systemd/agx-doctor.path:5,6`
- `agents/models/roster.ts:3,71,194,202,203,204`
- `agents/skills/driving-grok/SKILL.md:27,31,102,180,217,219,233,235`
- `scripts/doctor.ts:1972,1979,1983`
- `tools/statusline/tests/fixtures/codex-rollout-run-activity.jsonl:1`
- `scripts/agx-accept.ts:158,167,172,182`


## After rename search: /home/fuyu/dotfiles.ws/ws_agx-suite-thin

- `README.md:108,141,149,150,154,183,214,215,219,222`
- `tools/disk-reclaim/tests/targets/d-tmpfs.test.ts:71`
- `systemd/agx-doctor.path:5,6`
- `mise.toml:29`
- `agents/skills/driving-grok/SKILL.md:27,31,102,180,217,219,233,235`
- `tools/agx-ticket/src/tickets.ts:392,398,559,562`
- `tools/statusline/tests/worker-rows.test.ts:9`
- `tools/statusline/README.md:108,220,235,237`
- `tools/statusline/src/dispatch-runs.ts:51,152`
- `tools/statusline/src/fleet-line.ts:3`
- `tools/statusline/src/dispatch-display.ts:147`
- `tools/statusline/src/agx-snapshot.ts:74`
- `tools/statusline/src/dataframe.ts:60`
- `tools/statusline/CHANGELOG.md:50`
- `tools/storage-headroom/tests/decision.test.ts:522`
- `tools/spec/agx-ticket.md:4,11,67,69,90,101,107`
- `tools/spec/architecture.md:44,49,61,62,63,64,65,66,67,81,82,84,85,102,120,226,248,261`
- `archives/skills/operating-the-harness/SKILL.md:29` (retired historical source)
- `tools/statusline/tests/fleet-line.test.ts:161`
- `tools/statusline/tests/fixtures/agx-ls-sample.json:18,36,37,38,44,123,204,249,280,311,333,359,389,422,444,510,583,625,647,669,686,691,722,767,804,809,860`
- `tools/statusline/tests/fixtures/codex-rollout-run-activity.jsonl:1`
- `tools/statusline/tests/statusline-run-row.test.ts:292,1339`
- `tools/jex/README.md:23,54,58,63`
- `tools/spec/agx-ws.md:37,42,43,82,113,133,135,136,137,138`
- `tools/agx-worker/tests/next/entrypoint.test.ts:26`
- `tools/agx-worker/tests/next/workspace-lock.test.ts:437`
- `tools/agx-worker/tests/next/run-temp.test.ts:99`
- `tools/shared/tests/fixtures/active-markers.ts:19`
- `tools/shared/src/test-tmp.ts:188`
- `tools/shared/CHANGELOG.md:9`
- `tools/agx-worker/tests/suite-layout.test.ts:6,9,10,17`
- `tools/agx-worker/tests/public.test.ts:44,57`
- `tools/agx-worker/tests/ticket.test.ts:30`
- `tools/agx-worker/src/next/continue.ts:22`
- `tools/agx-worker/src/next/cli.ts:63,77,89,247`
- `tools/agx-worker/src/next/store.ts:125`
- `tools/agx-worker/src/next/run.ts:835`
- `tools/agx-worker/src/next/wait.ts:62,98`
- `tools/agx-worker/src/next/public.ts:15,23,34,38,44,69`
- `tools/agx-worker/src/next/doctor.ts:27`
- `tools/agx-worker/src/workers/codex-progress.ts:2`
- `tools/agx-worker/src/temp.ts:18`
- `agents/claude/README.md:43`
- `tools/agx-worker/src/ticket.ts:296`
- `agents/claude/agents/sonnet-medium.md:5`
- `agents/claude/agents/sonnet-high.md:6`
- `agents/claude/hooks/tests/enforce-background-waits.test.ts:285,340`
- `agents/claude/hooks/tests/enforce-dispatch-contract.test.ts:10,53,58,59,60,61,62,64`
- `agents/claude/hooks/tests/bash-durations.test.ts:36`
- `agents/claude/hooks/tests/dispatch-contract.diagnostic-card.md:14,15,16,19,20,22`
- `agents/claude/hooks/enforce-background-waits.ts:24`
- `agents/claude/hooks/log-agx-snapshot.ts:10,46,47`
- `agents/claude/hooks/enforce-dispatch-contract.ts:2,6,24,48,49,50,51`
- `agents/claude/hooks/bash-durations.ts:9`
- `agents/claude/CLAUDE.md:11,12,13,18,21`
- `.agents/tickets/agxlsfold.md:4,12,16`
- `.agents/tickets/run-outcome2.md:4`
- `.agents/tickets/agx-snapshot-hook.md:4`
- `.agents/tickets/agx-tmp2.md:4`
- `.agents/tickets/agx-ls-wait.md:4`
- `.agents/tickets/naming-display.md:12`
- `.agents/tickets/workspace-tool.md:18`
- `.agents/tickets/jjsafe2.md:29`
- `.agents/tickets/agx-one-run-per-ws.md:4,12,23`
- `.agents/tickets/gitlockport2.md:12,13,39`
- `.agents/tickets/runcommit2.md:4,22`
- `.agents/tickets/runcommit.md:4,22`
- `.agents/tickets/agx-verify-env.md:4`
- `tools/agx-worker/src/dispatch.ts:28,146,151,196,204,215,224,234,245,257,268,277,283,295,303,337,358,379,400`
- `tools/agx-worker/contract.md:3,8,9,10,11,12,14,17,20,35,44`
- `tools/agx-worker/CHANGELOG.md:5,74,130,146,154,177,187,191,193,197,254,398`
- `tools/agx-worker/package.json:8`
- `tools/agx-worker/docs/next-records.md:1,3,5,9,10,12,13,18,19,20,24,26,78,91,112,144,150,158,167,174,175`
- `tools/agx-worker/docs/scope.md:1,3,7,9,13,44,46,50,51,52,53,54,55,56,57,58,59,60,65,78,82`
- `tools/agx/README.md:11,14,23,33`
- `tools/agx/CHANGELOG.md:22`
- `tools/agx-worker/tests/next/continue.test.ts:139,189`
- `tools/agx-worker/tests/next/fixtures/lost-race-records.jsonl:3`
- `tools/agx-worker/tests/next/fixtures/legacy-real-shapes.jsonl:1`
- `agents/skills/driving-antigravity/SKILL.md:24,25,188,189,195,215,217`
- `.agents/tickets/continue-pin.md:4`
- `.agents/tickets/facts-agx.md:20,21,24`
- `.agents/tickets/runslug.md:13,17,27,45`
- `.agents/tickets/facts-tools.md:19`
- `.agents/tickets/agx-overrun.md:4,17`
- `.agents/tickets/gitlockport.md:12,13,39`
- `.agents/tickets/triage-unlanded.md:4,16,17`
- `.agents/tickets/tmp-leaks.md:4,13`
- `.agents/tickets/agx-no-orphan.md:4,12,20,24`
- `.agents/tickets/agx-ticket-home.md:4`
- `.agents/tickets/agx-ls-wait-latest.md:4,16`
- `.agents/tickets/agx-sweep-nonfatal.md:4,16`
- `.agents/tickets/gitlock.md:12,13,39`
- `.agents/tickets/jjsafe.md:29`
- `.agents/tickets/agx-tmp.md:4`
- `.agents/tickets/landpipe.md:4,22,25,29,34`
- `.agents/tickets/fixture-modes.md:17`
- `.agents/tickets/stale-link-test.md:28,29,30,31,32`
- `.agents/tickets/statusflap.md:4,13,23,29,36`
- `.agents/tickets/run-outcome.md:4`
- `.agents/tickets/admit.md:19,24`
- `.agents/tickets/tkt.md:4,12`
- `agents/hooks/tests/enforce-search-route.test.ts:280,281,298,299,300,317,318,319,320,322,323,324,325,326,327,328,329,348,350,382`
- `agents/hooks/tests/search-route.syntax.test.ts:46,47`
- `agents/hooks/storage-headroom.contract.md:17`
- `agents/models/tests/roster.test.ts:208,209,210,211,212,216`
- `package.json:49`
- `agents/models/roster.ts:194,202,203,204`
- `agents/models/dispatch-roster.toml:3`
- `agents/models/dispatch-roster.contract.md:6,12,14,15,16,17,18,19,21,27`
- `agents/codex/AGENTS.md:11`
- `agents/skills/orchestrating-agents/references/model-roster.md:22,26`
- `scripts/agx-accept.ts:150,158,167,172,182`
- `scripts/land.ts:147,164,901,1007,1062,1064,1065`
- `tools/agx-ws/src/workspace.ts:659,660,663,668,1999,2171`
- `scripts/doctor.ts:1972,1979,1983`
- `scripts/config-registry.ts:683`
- `scripts/link-dots.ts:889`
- `scripts/doctor-remote.ts:132`
- `scripts/agx-doctor.ts:42,71,86,91,109`
- `CLAUDE.md:49,117,118`
- `scripts/tests/agx-accept.test.ts:155,157`
- `scripts/tests/render-home.test.ts:263,264,265,266,267,268,269,270,565,572,573,574,575,576,577,578`
- `scripts/tests/land.test.ts:1001,1124,1126,1215,1224,1238`
- `scripts/tests/statusline-owners.test.ts:79,82,85`
- `agents/skills/wiring-mise-tasks/SKILL.md:78`
- `tools/agx-worker/tests/next/run.test.ts:42,827,949`
- `agents/skills/orchestrating-agents/SKILL.md:83,360`
- `scripts/tests/doctor.test.ts:93,113`
- `scripts/tests/agx-doctor.test.ts:147,160,177,409,564,695,702`
- `tools/agx-worker/tests/next/ls-selector.test.ts:107`


## After rename search: /home/fuyu/dotfiles

- `README.md:108,141,149,150,154,183,214,215,219,222`
- `CLAUDE.md:49,117,118`
- `package.json:25,26`
- `tools/disk-reclaim/tests/targets/d-tmpfs.test.ts:71`
- `systemd/agx-doctor.service:13`
- `systemd/agx-doctor.path:5,6`
- `lint/no-sync-baseline.tsv:60,61,62,63,64,65,66,67,68,69,70,71,72,73`
- `tools/spec/agx-ticket.md:4,11,67,69,90,101,107`
- `tools/spec/architecture.md:44,49,61,62,63,64,65,66,67,81,82,84,85,102,119,120,122,123,127,130,131,133,226,248,261`
- `tools/spec/agx-ws.md:37,42,43,82,113,133,135,136,137,138`
- `scripts/agx-accept.ts:150,158,167,172,182`
- `scripts/land.ts:128,130,134,139,147,164,901,1007,1062,1064,1065`
- `mise.toml:29,440`
- `agents/skills/driving-grok/SKILL.md:27,31,102,180,217,219,233,235`
- `tools/agx-ws/src/workspace.ts:659,660,663,668,1999,2171`
- `scripts/lint-bun.ts:29,30`
- `scripts/tests/agx-host.test.ts:13`
- `scripts/config-registry.ts:501,683`
- `scripts/doctor.ts:1967,1972,1979,1983`
- `scripts/tests/doctor.test.ts:93,113`
- `tools/jex/README.md:23,54,58,63`
- `scripts/tests/land.test.ts:239,241,242,245,248,437,439,441,442,445,446,449,474,482,509,518,1001,1124,1126,1215,1224,1238`
- `scripts/tests/tracked-files.test.ts:120,121`
- `scripts/tests/render-home.test.ts:263,264,265,266,267,268,269,270,565,572,573,574,575,576,577,578`
- `tools/agx/tests/doctor.test.ts:136,149,166,385,386,387,398,553,680,684,687,691`
- `tools/agx/tests/suite-entry.test.ts:49,56,57,58,59,74,87`
- `tools/agx-run/tests/next/entrypoint.test.ts:4,5,8,10,16,19,21,26`
- `tools/agx/README.md:11,14,23,33`
- `tools/agx/src/agx.ts:4,31`
- `tools/agx/src/doctor.ts:15,71,86,91,97,109`
- `tools/agx/src/dispatch.ts:28,140,146,151,196,204,215,224,234,245,257,268,277,283,295,303,337,358,365,379,400`
- `tools/agx/CHANGELOG.md:22`
- `archives/skills/operating-the-harness/SKILL.md:29` (retired historical source)
- `tools/agx-run/tests/next/workspace-lock.test.ts:108,150,318,414,437`
- `tools/agx-run/tests/next/incremental-fold.test.ts:207,238`
- `scripts/agx-host.ts:13`
- `agents/skills/writing-bun-scripts/tests/cleye-corpus.test.ts:22,23,86`
- `tools/agx-run/tests/next/run-temp.test.ts:46,99`
- `tools/agx-run/tests/next/no-orphan.test.ts:40,119`
- `tools/agx-run/tests/next/ticket-home.test.ts:26`
- `scripts/link-dots.ts:889`
- `tools/agx-run/tests/next/ls-selector.test.ts:96,107`
- `tools/agx-run/tests/next/route.test.ts:257`
- `scripts/tests/agx-accept.test.ts:123,155,157`
- `tools/agx-run/tests/next/lost-race.test.ts:153`
- `scripts/doctor-remote.ts:132`
- `tools/agx-run/tests/next/run.test.ts:42,72,242,307,321,342,372,407,481,530,597,609,651,681,710,734,788,827,866,941,949,952,959,978`
- `tools/agx-ticket/src/tickets.ts:392,398,559,562`
- `tools/detect-japanese/tests/classify.test.ts:63`
- `tools/agx-run/tests/next/wait-cursor.test.ts:160`
- `scripts/tests/statusline-owners.test.ts:79,82,85`
- `tools/agx-run/tests/next/fixtures/lost-race-records.jsonl:3`
- `tools/agx-run/tests/next/fixtures/legacy-real-shapes.jsonl:1`
- `tools/agx-run/tests/next/outcome.test.ts:76,106`
- `tools/agx-run/tests/next/ls-wait.test.ts:70`
- `scripts/tests/deploy-characterization/inventory.path-line.txt:152,156`
- `tools/agx-run/tests/next/continue.test.ts:85,139,189`
- `tools/agx-run/CHANGELOG.md:5,74,130,146,154,177,187,191,193,197,254,398`
- `tools/agx-run/package.json:3,7,8`
- `tools/agx-run/docs/next-records.md:1,3,5,9,10,12,13,18,19,20,24,26,78,91,112,144,150,158,167,174,175`
- `agents/hooks/tests/enforce-search-route.test.ts:280,281,298,299,300,317,318,319,320,322,323,324,325,326,327,328,329,348,350,382`
- `tools/agx-run/tests/ticket.test.ts:30,165,166`
- `tools/agx-run/docs/scope.md:1,3,7,9,13,44,46,50,51,52,53,54,55,56,57,58,59,60,65,78,82`
- `tools/agx-run/docs/ref-writer-inventory.md:78,79,80,81,82,83,84`
- `tools/agx-run/src/next/continue.ts:22`
- `tools/agx-run/src/next/cli.ts:37,55,58,72,84,106,124,164,188,208,224,241`
- `tools/statusline/tests/fleet-line.test.ts:161,216`
- `tools/agx-run/src/next/store.ts:125`
- `tools/statusline/tests/step4.test.ts:148`
- `tools/agx-run/src/next/run.ts:835`
- `tools/agx-run/src/next/wait.ts:62,98`
- `tools/agx-run/src/next/public.ts:12,20,31,35,41,51`
- `tools/agx-run/src/next/doctor.ts:16,26`
- `tools/agx-run/src/workers/codex.ts:11,146,147`
- `agents/hooks/tests/search-route.syntax.test.ts:46,47`
- `tools/agx-run/tests/suite-layout.test.ts:6,8,9,10,15,16`
- `tools/agx-run/src/workers/codex-progress.ts:2`
- `tools/agx-run/src/temp.ts:18`
- `tools/agx-run/src/ticket.ts:10,11,296`
- `agents/hooks/storage-headroom.contract.md:17`
- `tools/agx-run/contract.md:3,8,9,10,11,12,14,17,20,35,44`
- `tools/shared/tests/fixtures/active-markers.ts:19`
- `.agents/tickets/agx-lost-race.md:4,5,6,12,16,25`
- `.agents/tickets/agxlsfold.md:4,12,16`
- `.agents/tickets/agx-ticket-home-2.md:4,5,6,8,12`
- `.agents/tickets/agx-doctor.md:4,5,6,8,12,16`
- `.agents/tickets/run-outcome2.md:4`
- `.agents/tickets/agx-orphan-close.md:4,5,6,12,16`
- `.agents/tickets/agx-snapshot-hook.md:4`
- `.agents/tickets/agx-tmp2.md:4`
- `.agents/tickets/agx-dispatch-fix.md:4,5,6`
- `.agents/tickets/naming-display.md:12`
- `.agents/tickets/fleet-line-real.md:4,5,6,21,23`
- `.agents/tickets/statusline-agx-oneline.md:4`
- `.agents/tickets/ws-work-lost.md:4,5,6`
- `.agents/tickets/workspace-tool.md:18`
- `.agents/tickets/agx-route-allow.md:4,5,6,8,16,17`
- `.agents/tickets/agx-ticket-context.md:4,5,6,8,20,21`
- `.agents/tickets/gitlockport2.md:12,13,39`
- `.agents/tickets/statusline-action-scope.md:4`
- `.agents/tickets/agx-assess.md:4,5,6,12`
- `.agents/tickets/purge-ticket-home-hook.md:4`
- `.agents/tickets/runcommit2.md:4,22`
- `.agents/tickets/agx-verify-env.md:4`
- `.agents/tickets/continue-pin.md:4`
- `.agents/tickets/facts-agx.md:20,21,24`
- `.agents/tickets/runslug.md:13,17,27,45`
- `.agents/tickets/ws-add-stale-rev.md:4`
- `.agents/tickets/facts-tools.md:19`
- `.agents/tickets/agx-overrun.md:4,17`
- `.agents/tickets/gitlockport.md:12,13,39`
- `.agents/tickets/slug-hyphen.md:4,5,6,12,22,23`
- `.agents/tickets/agx-public-cli.md:4,5,6,8,12`
- `.agents/tickets/agx-suite-split.md:4,6,8,12,17`
- `.agents/tickets/fleet-state.md:4`
- `.agents/tickets/triage-unlanded.md:4,16,17`
- `.agents/tickets/tmp-leaks.md:4,13`
- `.agents/tickets/land-post-deploy-verify.md:4,16`
- `.agents/tickets/doctor-actionable.md:4,5,6,12`
- `.agents/tickets/agx-no-orphan.md:4,12,20,24`
- `.agents/tickets/statusline-core-only.md:4,5,6,12,13,58`
- `tools/statusline/tests/fixtures/agx-ls-sample.json:18,36,37,38,44,123,204,249,280,311,333,359,389,422,444,510,583,625,647,669,686,691,722,767,804,809,860`
- `tools/statusline/tests/__snapshots__/fleet-line.test.ts.snap:3,5`
- `tools/statusline/tests/worker-rows.test.ts:9`
- `tools/statusline/README.md:111,222,231,234,236`
- `tools/statusline/src/dispatch-runs.ts:51,153`
- `tools/statusline/src/fleet-line.ts:22`
- `tools/shared/src/test-tmp.ts:188`
- `tools/shared/CHANGELOG.md:9`
- `tools/statusline/tests/fixtures/codex-rollout-run-activity.jsonl:1`
- `agents/codex/AGENTS.md:11`
- `agents/skills/driving-antigravity/SKILL.md:24,25,188,189,195,215,217`
- `tools/statusline/src/agx-snapshot.ts:76`
- `agents/models/tests/roster.test.ts:208,209,210,211,212,216`
- `.agents/tickets/statusline-standalone.md:22,24`
- `.agents/tickets/agx-ticket-home.md:4,5,6,8,26`
- `tools/statusline/tests/statusline-run-row.test.ts:33,292,495,777,1333`
- `.agents/tickets/agx-dispatch.md:4,5,6,8,12,16,27`
- `.agents/tickets/agx-ls-wait-latest.md:4,16`
- `.agents/tickets/jjsafe2.md:29`
- `.agents/tickets/agx-capability-reasoning.md:4,5,6,12,16`
- `.agents/tickets/agx-check-repo.md:4,5,6,12,13`
- `.agents/tickets/agx-sweep-nonfatal.md:4,16`
- `.agents/tickets/agx-one-run-per-ws.md:4,12,23`
- `.agents/tickets/statusline-step3.md:4`
- `.agents/tickets/redo-versionguard.md:5`
- `agents/models/roster.ts:3,71,194,202,203,204`
- `agents/models/dispatch-roster.toml:3,5,6`
- `agents/models/dispatch-roster.contract.md:6,12,14,15,16,17,18,19,20,21,27`
- `agents/skills/orchestrating-agents/SKILL.md:83,360`
- `agents/skills/orchestrating-agents/references/model-roster.md:22,26`
- `tools/statusline/src/dataframe.ts:60`
- `.agents/tickets/runcommit.md:4,22`
- `agents/skills/wiring-mise-tasks/SKILL.md:78`
- `.agents/tickets/statusline-fleet-line.md:4,5,25,26,28`
- `.agents/tickets/agx-ticket-home-3.md:5,6,8,12`
- `.agents/tickets/admit.md:19,24`
- `.agents/tickets/tkt.md:4,12`
- `.agents/tickets/worker-escape-check.md:5,6,9`
- `.agents/tickets/agx-snapshot-stop.md:4`
- `.agents/tickets/agx-scratch-cd.md:4,5,6,8`
- `.agents/tickets/alpha-green.md:4,6`
- `.agents/tickets/statusline-step4.md:4`
- `tools/statusline/CHANGELOG.md:58`
- `.agents/tickets/ws-gc-timer.md:4`
- `.agents/tickets/statusline-step2.md:27`
- `.agents/tickets/agx-doctor-unit.md:4,5,12`
- `.agents/tickets/cli-version-short.md:6`
- `.agents/tickets/worker-return-deadline.md:4,5,6,9`
- `.agents/tickets/stale-link-test.md:28,29,30,31,32`
- `.agents/tickets/agx-suite-thin.md:4,5,12,23,24,26`
- `.agents/tickets/statusflap.md:4,13,23,29,36`
- `.agents/tickets/run-outcome.md:4`
- `.agents/tickets/statusline-worker-rows.md:4,5,23`
- `.agents/tickets/redo-agxsandbox.md:5,21`
- `.agents/tickets/land-records-landing.md:5,6`
- `.agents/tickets/ws-gc-unaccepted.md:4,16`
- `.agents/tickets/agx-wait-block.md:4,5,6,8,12`
- `.agents/tickets/gitlock.md:12,13,39`
- `.agents/tickets/jjsafe.md:29`
- `.agents/tickets/agx-run-gpu-reader.md:3,4,5,6,8,12`
- `.agents/tickets/agx-tmp.md:4`
- `.agents/tickets/agx-capacity-reroute.md:5,6`
- `.agents/tickets/landpipe.md:4,22,25,29,34`
- `.agents/tickets/write-set-check.md:4,5,16`
- `.agents/tickets/fixture-modes.md:17`
- `.agents/tickets/ws-simplify.md:4,5,12`
- `.agents/tickets/agx-ls-wait.md:4`
- `agents/claude/README.md:43`
- `agents/claude/agents/sonnet-medium.md:5`
- `tools/storage-headroom/tests/decision.test.ts:522`
- `agents/claude/agents/sonnet-high.md:6`
- `agents/claude/hooks/log-agx-snapshot.ts:20,25`
- `agents/claude/CLAUDE.md:11,12,13,18,21`
- `agents/claude/hooks/bash-durations.ts:9`
- `agents/claude/hooks/tests/enforce-background-waits.test.ts:285,340`
- `agents/claude/hooks/enforce-dispatch-contract.ts:2,6,24,48,49,50,51`
- `agents/claude/hooks/tests/enforce-dispatch-contract.test.ts:10,53,58,59,60,61,62,64`
- `agents/claude/hooks/enforce-background-waits.ts:24`
- `agents/claude/hooks/tests/dispatch-contract.diagnostic-card.md:14,15,16,19,20,22`
- `agents/claude/hooks/tests/bash-durations.test.ts:36`
- `agents/claude/hooks/tests/log-agx-snapshot.test.ts:26`


## After rename search: /home/fuyu/Workspace/Example-science

No matching callers or mentions (search exit 1).


## After rename search: /home/fuyu/Workspace/retrospectives

- `records/20261015_scope-reversal-retro.md:27,90,93,94,95,96,98,101,134,135`
- `records/20261016_coordinator-idle-overnight-retro.md:18,20,79`
- `records/20261012_example-learner-devx-retro.md:25`
- `records/20261014_coordination-blockers-retro-2.md:64,70,85,114,122,125`
- `records/20261016_frustration-review-6.md:53`
- `records/20261015_example-learner-issue-structure-morning.md:11,49`
- `records/20261015_example-app-issue-structure-postmortem.md:50`
- `records/20261016_example-learner-branch-repairs-not-on-main-line.md:12`
- `records/20261013_dotfiles-cli-devx-retro.md:80,82,83`
- `records/20261018_dotfiles-night-issue-structure.md:55,56,100,118`
- `records/20261016_dotfiles-land-lane-and-acceptance-noise.md:20,74,77,87,88,110`
- `records/20261014_example-learner-concept-split-retro.md:71`
- `records/20261016_example-learner-devx-and-concept-consolidation.md:12,28,108,109,110,111,112`
- `records/20261016_example-learner-critical-path-blindness.md:91`
- `records/20261015_integration-pipeline-retro.md:79,128`
- `records/20261014_example-learner-issue-structure-retro.md:87`
- `records/20261016_frustration-review-3.md:24,49`
- `records/20261015_dusk-shared-state-retro.md:50,77`
- `records/20261014_agx-cutover-retro.md:34,35,52,58,74,77,109`
- `records/20261016_example-learner-split-without-interface.md:20`
- `records/20261015_example-learner-issue-structure-evening.md:81`
- `records/20261016_example-learner-research-line-starved.md:11`
- `records/20261016_example-search-issue-structure-retro.md:61,77,127,145`
- `records/20261011_example-learner-coord-postmortem2610-1114e1block.md:28`
- `records/20261015_dispatch-hearing.md:22,42,72,78,81,119,140,149`
- `records/20261015_afternoon-coordination-retro.md:28,110`
- `records/20261017_dotfiles-progress-blockers-frustration.md:10,11,47,56,102`
- `records/20261014_example-learner-brief-devx-retro.md:57,59`
- `records/20261014_example-learner-evening-retro.md:45`
- `records/20261015_dispatch-architecture.md:24,25,26,27,28,29,40,41,42,43,44,56,57,58,59,78,81,82,85,96,109,167,168,169,170,172,209,283,286,290,293,296`
- `records/20261016_frustration-review-5-and-devx.md:111,132`
- `records/20261016_retrospectives-schema-and-review-gate-frustration.md:85`
- `records/20261016_example-app-layering-and-usecase-gap-frustration-review.md:45`
- `records/20261017_dotfiles-statusline-heavy-render-frustration.md:4,28,35,50,52,84,107,110`
- `records/20261014_coordination-blockers-retro.md:21,29,35,76,80,88`
- `records/20261017_dx-design-frustration-review.md:74`
- `records/20261016_housekeeping-blocks-work-retro.md:18,78`
- `records/20261016_example-search-v1-frustration-review.md:34,48,72`
- `records/20261015_example-search-issue-structure-retro.md:22,28,101,136`
- `records/20261015_evening-agx-devx-retro.md:10,60,62,63,71,81,106,108,109,115,132,143`
- `records/20261014_example-learner-contract-overreach-postmortem.md:42`
- `records/raw/20261016_example-app-layering-reports.txt:4,11,16,21`
- `records/20261015_devx-progress-blockers-retro.md:30,31,45,84,92`
- `records/20261014_issue-structure-retro.md:24,32,95,120`
- `records/20261015_ticket-home-retro.md:29,57,61,68,69,70,71,73,76`
- `.agents/tickets/rg-jev-path.md:4,16`
- `.agents/tickets/rg-agx-cli.md:4,17,19,22`
- `.agents/tickets/rg-simplify.md:16`


## After rename search: /home/fuyu/Workspace/Coral-dpp

- `move/plustag-core/spec/revisions/2026-10-14-r1-credential-gated-record-ledger.md:346`


## After rename search: /home/fuyu/Workspace/dx

- `README.md:295`
- `.agents/tickets/dx-review.md:16,25,45`
- `.agents/tickets/dx-review-fix-422.md:4,24,35,36`
- `.agents/tickets/jev-contract.md:4,12,13,20,30,31`
- `.agents/tickets/dx-simplify.md:24`
- `notes/jev-contract.md:1,5,40,43,48,90,91`
- `notes/genealogy/soks.md:118`
- `src/config.ts:16`
- `docs/spec.md:36,265,439`
- `tests/contracts.test.ts:236`
- `tests/fixtures/retrospectives-review.json:13,14,15`


## After rename search: /home/fuyu/Workspace/example-app

- `.agents/tickets/int19-fix.md:53`
- `.agents/tickets/accept-ledger.md:39`
- `.agents/tickets/testfix4.md:20`
- `.agents/tickets/sdk-layer.md:40`
- `.agents/tickets/tg-heritage-n36.md:20,23`
- `.agents/tickets/testfix3-ts-e2e.md:20`
- `.agents/tickets/a8-final-acceptance.md:30`
- `.agents/tickets/roles-diag.md:40`
- `.agents/tickets/sc1-schema-type-crosswalk.md:21,26`
- `.agents/tickets/m2-contract-warns.md:18`
- `.agents/tickets/sc2-heritage-schema-fidelity.md:18,24`
- `.agents/tickets/lint-core-errors-as-values.md:18`
- `.agents/tickets/api-sync.md:23`
- `.agents/tickets/tg-move-spec-tests.md:20,29`
- `.agents/tickets/compat-cut.md:26`
- `.agents/tickets/tg-core-spec-tests.md:20`
- `.agents/tickets/t3c2-typecheck-green.md:18,20`
- `.agents/tickets/date-type.md:22,25`
- `.agents/tickets/s15-move-ts-refs-by-name.md:19,22`
- `.agents/tickets/tg2-move-v5.md:20,21`
- `.agents/tickets/lint-react.md:20`
- `.agents/tickets/tg3-heritage-rows.md:19,29`
- `.agents/tickets/merge20.md:31`
- `.agents/tickets/scope-xdg.md:30,45`
- `.agents/tickets/tg5-heritage-hv.md:19`
- `.agents/tickets/tg6-core-c3.md:19,24`
- `.agents/tickets/tg3-move-rows.md:19,35`
- `.agents/evidence/move-style-audit-2026-10-18.md:3`
- `.agents/tickets/mv-slot-policy.md:19`
- `.agents/tickets/s11-move.md:18,24`
- `.agents/tickets/s14-heritage-refs-by-name.md:19`
- `.agents/tickets/ts-slot-heritage.md:21,28`
- `.agents/tickets/s11-spec-traceability.md:19,24`
- `.agents/tickets/merge18b.md:24`
- `.agents/tickets/t3d-schema-identity-events.md:25`
- `.agents/tickets/s6b-spec-strictest-layer.md:18`
- `.agents/tickets/s7-spec-events-identity.md:18,19`
- `.agents/tickets/sc3-schema-publication-impl.md:20`
- `.agents/tickets/tr2-trace-by-name.md:18,22`
- `.agents/tickets/s9-spec-result-api.md:18`
- `.agents/tickets/l1c-localnet-tmpdir.md:21`
- `.agents/tickets/w1t-ts-lint.md:18`
- `.agents/tickets/tg4-move-v7-n33.md:19`
- `.agents/tickets/s11-ts.md:18,24`
- `.agents/tickets/s4-spec-fixes.md:24`
- `.agents/tickets/m3-move-home-lock.md:21,23`
- `.agents/tickets/impl-h12.md:25,31`
- `.agents/tickets/se-impl.md:22`
- `.agents/tickets/fix2-lint.md:19,24`
- `.agents/tickets/tg3-core-weak-rows.md:19,27`
- `.agents/tickets/e2e1-parallel-verify.md:20`
- `.agents/tickets/s11-heritage.md:18,24`
- `.agents/tickets/l1b-publish-path-e2e.md:18`
- `.agents/tickets/tr-move.md:23`
- `.agents/tickets/p4b-split-acceptance-continue.md:32`
- `.agents/tickets/p3-split-core-dpp.md:31`
- `.agents/tickets/spec-fix.md:23,28`
- `.agents/tickets/int1c-fmt-lintfix.md:26`
- `.agents/tickets/p7b-codegen-builders.md:19,25`
- `.agents/tickets/flaky-c7.md:22`
- `.agents/tickets/m1-react-in-check.md:22`
- `.agents/tickets/impl-h12c.md:22`
- `.agents/tickets/w1-mise-wiring.md:18`
- `.agents/tickets/w1m-mise-verbs.md:18`
- `.agents/tickets/lint-heritage.md:26,29`
- `.agents/tickets/fix1-check-green.md:18,27`
- `.agents/tickets/i11d-move-test-hygiene.md:26`
- `.agents/tickets/tg2-ts-c7-c12.md:20,28,40`
- `.agents/tickets/s13-spec-h-rows.md:19`
- `.agents/tickets/lint-scripts.md:23`
- `.agents/tickets/sp-rules.md:25`


## After rename search: /home/fuyu/Workspace/example-search-v1

- `.agents/tickets/261016-gatebudget.md:6`
- `.agents/tickets/261016-doctormem.md:6`
- `.agents/tickets/261016-conffix.md:5`
- `.agents/tickets/261015-readlock.md:8,9`
- `.agents/tickets/261016-stdoutblock.md:5`
- `.agents/tickets/261010-spec-delta6.md:30`
- `.agents/tickets/261015-verifybig.md:5`
- `.agents/tickets/261015-verifyrace.md:36`
- `docs/v0-port/COORDINATOR-RETRO.md:61`
- `docs/spec-drafts/1.202610.6-delta.md:45`


## After rename search: /home/fuyu/Workspace/example-suite-monorepo

No matching callers or mentions (search exit 1).


## After rename search: /home/fuyu/Workspace/example-records-v2

- `.agents/tickets/rr2-review-rubric.md:11,38,68`


## After rename search: /home/fuyu/Workspace/example-search

No matching callers or mentions (search exit 1).


## After rename search: /home/fuyu/Workspace/example-records-v1

- `fragments/0d99891aed96603a17a0139ad56fb841ac3aa1b173679087fb3a023546206b55/objects/248177d2778f653c941bbf428d3655906e7af5eed380760c27f425408c75eef7:8`
- `fragments/0d99891aed96603a17a0139ad56fb841ac3aa1b173679087fb3a023546206b55/objects/e501055ec716bb74478649516d18cccac79d4e8650898db53b5b3b10de303929:8`
- `fragments/0d99891aed96603a17a0139ad56fb841ac3aa1b173679087fb3a023546206b55/objects/406609ea6a969d8f74d0ecb54daa3cad65b34a2aeb68bfaa534750394b9aeb67:8`
- `fragments/0d99891aed96603a17a0139ad56fb841ac3aa1b173679087fb3a023546206b55/objects/69c3c7e73c19975cda5ac142f5ab08906f64cf5138b31e3324ad9e5bbc2bed38:8`
- `fragments/0d99891aed96603a17a0139ad56fb841ac3aa1b173679087fb3a023546206b55/objects/2bd1e5f41252c6f05dbeb8ed9be967adbdb7278a741f597a1a5c082b9f9575f7:8`
- `fragments/0d99891aed96603a17a0139ad56fb841ac3aa1b173679087fb3a023546206b55/objects/962826b17c1c08c427279e03c7113d32b3b30afd8cee69e23688df4ae83c78ff:8`
- `fragments/0d99891aed96603a17a0139ad56fb841ac3aa1b173679087fb3a023546206b55/objects/21cecd54b4d34b320150ccd1612ff8ce32a6d99df0cd5cb2d52ab91c65cb6636:8`
- `fragments/0d99891aed96603a17a0139ad56fb841ac3aa1b173679087fb3a023546206b55/objects/7d3ce760a313a4612e03d5d3f2c48e0f8c3b273c3bc824cee3d52b0afb79d203:8`
- `fragments/e630b3d7c4edfc9c74b0d24e3d34185ff2c66ee837280769bfc38496df4bf9ba/objects/7c2ed8323563e9e9f6a10e3d1ded58b4939768fed81eccae57775fe0afecc35e:2`
- `fragments/0d99891aed96603a17a0139ad56fb841ac3aa1b173679087fb3a023546206b55/objects/e73c5f2fcd6683ec3f6237904af5a2f909ade5f72aad61d420cfb37f23b951d5:8`
- `fragments/e630b3d7c4edfc9c74b0d24e3d34185ff2c66ee837280769bfc38496df4bf9ba/objects/804609ef2868e4b9136e636e1d7b3af27670b5229cc04d352f302aed46b0b765:1,2`
- `fragments/0d99891aed96603a17a0139ad56fb841ac3aa1b173679087fb3a023546206b55/objects/1c78c27a90cb440bb4ecfc167caa8973649439632233db15ec6910541e9b4d5d:8`
- `fragments/0d99891aed96603a17a0139ad56fb841ac3aa1b173679087fb3a023546206b55/objects/711975f66cd943f1b2dee9a63e89fab470ab83f479b1f5fbecd3e2f54614e734:8`
- `fragments/0d99891aed96603a17a0139ad56fb841ac3aa1b173679087fb3a023546206b55/objects/9955ae4d7441d747b248de560a19a1e085dd5bd83148305371e204fa564d1b31:8`
- `fragments/0d99891aed96603a17a0139ad56fb841ac3aa1b173679087fb3a023546206b55/objects/b3796b3e5b5b68667e3db2e7e80a08d75ef523b04c7dc9a1e86ce62cf467463a:8`
- `fragments/0d99891aed96603a17a0139ad56fb841ac3aa1b173679087fb3a023546206b55/objects/9e702cd5f74aa404d9c7bdf6f02d76ca6afb78b1665160f2aec2a99f1941fb43:8`
- `fragments/ea5ec945f56244d31d650e2f14b101d6d78af08dbb58223632927ff809777ba2/objects/80bcd4cd0b5520f406336e2cd804f13acfb51646d8c98288ee090bf841ac8f6f:7`
- `fragments/ea5ec945f56244d31d650e2f14b101d6d78af08dbb58223632927ff809777ba2/objects/487182fc7380100db9a02598e6694a656e25a29b0fca59b251ecf000ccc55a76:2`
- `fragments/2f33506f2773338a2f7e55ff4d1a0cea2dd0d204fe323e9130d525c21c93d19a/objects/62e39a4ddd46052c6a66700f695cfaf91dba35e6cad3e8ef5767f06d77fa29d2:7`
- `fragments/2f33506f2773338a2f7e55ff4d1a0cea2dd0d204fe323e9130d525c21c93d19a/objects/a5eff4d8531a57bdc6fddee9749b6373515c343e083ddcbc7a34e5d31348af6d:2`
- `fragments/17f2dfe3d07fecd0b8d63d34e6d81f16889ea545bc5f9ccdf64724d24f4aa2e5/objects/b477efa5bec9bb6959ab58535770e2cbf763680c3b11fa8af319eec553db3d2f:2`
- `fragments/17f2dfe3d07fecd0b8d63d34e6d81f16889ea545bc5f9ccdf64724d24f4aa2e5/objects/e2d8207396d6c3f3a6d70d27b7a1846a56aee8ccc85d992c92eebf2d4ad58180:7`
- `fragments/2a591a8952af769e7f1190c51ba289f547c1e06c34f99a12d3131f3c86041da0/objects/0837d3b621aa754f44e2afb40149a47407c44d1bc08c9887f8c0f512258639d5:2`
- `fragments/2a591a8952af769e7f1190c51ba289f547c1e06c34f99a12d3131f3c86041da0/objects/4cd018be9616e2d08c2554fb92374da747de7222692020786cc39ae47084c7c7:7`
- `fragments/7f1d5ec909c959d4ce151551e7cb43073c1c117629397273dc4d2709359ea05a/objects/c8185929674c22d4144d64831d7ba2e18fd1f3d32e5c2b45fb6a3268d7421052:1,2`
- `fragments/7f1d5ec909c959d4ce151551e7cb43073c1c117629397273dc4d2709359ea05a/objects/fcdb948b8671c99886b7e4e491d9b2e2a9f0a104b71aa6e19f79363a1fec508e:2`
- `fragments/4790415486e98048b00289690300a48d3c932765b169e2e0101ea26426a2e98f/objects/337252968b78e9380cabfe32b323ac17cc9e0775b26283502eed77d909e643a6:2`
- `fragments/4790415486e98048b00289690300a48d3c932765b169e2e0101ea26426a2e98f/objects/91a164086f5f0d07119fdf4ac66b2f650c5ea88f619ea73779926817964a5435:7`
- `fragments/00897a0d3f28062d707d0fe6a230a73ee11b818a1b5700087bedace7d9f8a13e/objects/9d6dbb8079fc4f77856f9c4424031627621398e1a05cea02e006173afa6742bf:1,2`
- `fragments/00897a0d3f28062d707d0fe6a230a73ee11b818a1b5700087bedace7d9f8a13e/objects/ef52316d8db415342b7cc182a5d450282c9abc596078cc43dfe08ae399356b63:2`
- `fragments/2b9e6edf191fae813f85e169415907d5e4e360aea57bc1debcadd1578c5dde13/objects/636b7fa5c3456f153e90c0549d3f2f055c048cc129ab02a9ba114b82d261515e:1,2`
- `fragments/2b9e6edf191fae813f85e169415907d5e4e360aea57bc1debcadd1578c5dde13/objects/ae8a962e631bd25f788f88ae79f4f045ecdc3750e66cc66826efa87a74def1f2:2`
- `fragments/5d016991ef7aedf0e60ccae44995d0a582a26b6216aa3fa2078c1f15341cd464/objects/2473bb3c8f0b972db7f5698e1c259ece23629cefb9a6f8c665e5f3b8c1534503:27`
- `fragments/f036add71d7a39d776c9871e80f4337f0ed5122c6937ca831d75de624cedb6e7/objects/eff13313c26d0f948b09350f6787e215f858bb2de5063e7409c5c244c4071ee7:8`
- `fragments/f036add71d7a39d776c9871e80f4337f0ed5122c6937ca831d75de624cedb6e7/objects/edf35c9b223fcfff98edce0e7240587069dca8b30fa18789630b1be001facff3:8`
- `fragments/f036add71d7a39d776c9871e80f4337f0ed5122c6937ca831d75de624cedb6e7/objects/c71b7a0e1bb664d230fe854accfff862c002eeac6f9d3c1973d5bc1b943a2d71:8`
- `fragments/69d20f2b03b97b68767ccd79c8360683518d10bd300ac68f05a45414568491f8/objects/e60b99d7e8e226b530635938bf0c6852b7d78dc23859e8b3d8158180421e5815:7`
- `fragments/69d20f2b03b97b68767ccd79c8360683518d10bd300ac68f05a45414568491f8/objects/32da6d33fdfa0b5c21ff374416fab27384888d6083571a826c0fc883961ee058:2`
- `fragments/3df2b8d8382264888d226a42756079e7ea3442732f3f9d967f33293e355751fb/objects/10af6da0a616bdfcb24f31cd3b73ac5eb60eb585d4b58b2ceb2429ce46a06329:7`
- `fragments/3df2b8d8382264888d226a42756079e7ea3442732f3f9d967f33293e355751fb/objects/4c276c96e7525880ed854b7e35d165bd8d14fc9fb7d76e658d426d9e84be955a:2`
- `fragments/1e6e52b0a7de335d0350459abc65a539d9b19534652a4a06ee2dd350aaf01b78/objects/6120d1ef460b1a0292eca18e4f22b47f1f41bf85e364361bf352f33eb68a7397:2`
- `fragments/1e6e52b0a7de335d0350459abc65a539d9b19534652a4a06ee2dd350aaf01b78/objects/7e988dbd44153abb7c2ea33a87ece77635582a00e57007e8d2fa978d3b1208f4:1,2`
- `fragments/2a5ac2db5a5e4611207f532cd3d1c38ff7743ef4a8f1ab4d37b531b0c2f569cf/objects/d98fe12d8ef4555b7f11afade6e8e844d4f2d7ebf6e735307743c7ec8b6a8508:7`
- `fragments/2a5ac2db5a5e4611207f532cd3d1c38ff7743ef4a8f1ab4d37b531b0c2f569cf/objects/52290703fb56e64291b1579aab58078101a000317286de0a8c4b297898498106:2`
- `fragments/71e26ad23c1db73d5a302a8d76172bd19bed30ef1b910238ea4131f5e2f5a95d/objects/8fbd7b8bfc83208616de6bd133468adadc2a2e813fdd6d67b51657a70e9cfc45:2`
- `fragments/71e26ad23c1db73d5a302a8d76172bd19bed30ef1b910238ea4131f5e2f5a95d/objects/73820fd69e545926d87cda6b70121ae7d2fcddd7466f4c6361b05280c1dd6863:7`
- `fragments/56e4bbcd90ffc4d6f816f1b56eec69d37f8bf5e83e90bebee176aba1c68034f6/objects/01adac2557117e8f595db3d4df1e57dccfc831afb107c403add12b3902c94ade:1,2`
- `fragments/56e4bbcd90ffc4d6f816f1b56eec69d37f8bf5e83e90bebee176aba1c68034f6/objects/261a6931389bb01dd5feb410c5a2e544cdb2ead642505fdd591bb63687eab904:2`
- `fragments/2df6f3b4da76f695efb908fb09daba30eaecc024d17611a1f7a1ba29d095802f/objects/4eb91f48517f3ca0eb992652129c8c36b96306a541d04be00e49b78a9d0a0a8e:7`
- `fragments/2df6f3b4da76f695efb908fb09daba30eaecc024d17611a1f7a1ba29d095802f/objects/8d840b0f449b9a353c150eb68dcb14c3a3a0642beead757b2a7baec34fe4a5c3:2`
- `fragments/86e4941f397773f5fae350e43f104deb6caaeb7c70d1ffb26f3b4fdb2ccfb230/objects/a9437ddf92d96e88c7b89ec2471394205cd69d2bdd50acdb0db37b6215afd08c:7`
- `fragments/86e4941f397773f5fae350e43f104deb6caaeb7c70d1ffb26f3b4fdb2ccfb230/objects/6eceaf58dda9c8dbb103f9fb2d15f88decd838e988cad99489d28672b04d63c5:2`
- `fragments/cc4b89b568169e8277230ff08aec1f8ee4199ec92d714caac0e6f0a2bf481f8d/objects/30eff1cb752009317b2e5f56ed30adc6ed3d5f78ef41f9f6620982c9cde90185:2`
- `fragments/cc4b89b568169e8277230ff08aec1f8ee4199ec92d714caac0e6f0a2bf481f8d/objects/bc4375ee81e589c4667f1ff473eb2aac0c268f9c016bdf37d065c36f35777847:1,2`
- `fragments/050eae6bb9623b971f967880a17312d76458233845b190651dd3885c461d517f/objects/dc196e8b8ea4ff3649b7fbab783de3bae54531ac777cf50a5f18a66340a47a4b:2`
- `fragments/050eae6bb9623b971f967880a17312d76458233845b190651dd3885c461d517f/objects/4bde47aa7a37038a649b628f1e4966a4a8bfb99ea398f433244e116aaf51a3c0:1,2`
- `fragments/45c54ff18a670398da8bddd6632f4ed026949c7df4eb87e1c1d6848ce35ac2bc/objects/1b1de855df1f1ec7afea9228f01beff57345c356ce832a4ecff2f53db99a9b70:2`
- `fragments/45c54ff18a670398da8bddd6632f4ed026949c7df4eb87e1c1d6848ce35ac2bc/objects/9e2f9ac4e5ee33ecba852444c2c57b794e239eabacb8806d1f3a2e5d4b8aea55:1,2`
- `fragments/f59bd5057edb3ef070704733131eb401dace07abeb4a68c021c83030eec057de/objects/a19f01d503f8248570682f8207770d30d24e79093ccbe9b9a8362d603adb2009:7`
- `fragments/f59bd5057edb3ef070704733131eb401dace07abeb4a68c021c83030eec057de/objects/b85760df4dbae593a3311b1f57869ea53817c8b3c7c6d8e23de72304786d11dc:2`
- `fragments/f502ab9865cd6469f3c0fe6921a71043d43d965366ecad5b95e1dff7c8b114f9/objects/c5fce37e7a29ff665134ec3da3ca3895a91f119a361759651c71355946e6df84:2`
- `fragments/f502ab9865cd6469f3c0fe6921a71043d43d965366ecad5b95e1dff7c8b114f9/objects/5d850f146d2a3eae5fbd73b30f0fe2d8448c6b1ec9973dbb278ad52969e25e38:7`
- `fragments/1ccfdfee7d41ffd9ebdd9fe149805cbcb740e7ca585ac07a800316ffabe9bc4b/objects/0320d785b280f849cc0644bd51c912628df4740c8887d5e573906e0cff31cd47:2`
- `fragments/1ccfdfee7d41ffd9ebdd9fe149805cbcb740e7ca585ac07a800316ffabe9bc4b/objects/27ac7f29fe5b6bb931711c47ab4421bdec2ec1fb64cdd2c3f37e195bffd41849:1,2`
- `fragments/bcff422dbd139ca1456f4fd0fb1aabe04b823acb0bcd0f52be8631a0f6293336/objects/00864ce3581abc4813167ade7490b1116543a2e5c21bda42c642eb784dde45c1:2`
- `fragments/bcff422dbd139ca1456f4fd0fb1aabe04b823acb0bcd0f52be8631a0f6293336/objects/086fcd16516b632798c72a85471eb8d7ac083651a00fcbe18b1ae0952bc216dc:7`
- `fragments/62e9f094ea00743280e6e96e1e6f49ea0d3e72e3f16cd44983eb4c2386393929/objects/da38689a63a0734aa2bea837df1b2fc7e647063b99bb92a0b45724477dc96231:8`
- `fragments/5aa46d3f12d268a4a6dc9a3f4610148c98574848ae0af4ec6be8f39645ac13f1/objects/951d399a2c849dfd54041897829e8600c37a9dbdcd4516267bb71ea0b8c2e106:8`
- `fragments/a8762b710cd504a46195e99de96221f2ced6f73e8cda716b46aeddb57b88fa47/objects/b8f413f50cf164ec03a5386bc2d76dec6cbd69fdce9f9c06342f790ad5a3e473:2`
- `fragments/a8762b710cd504a46195e99de96221f2ced6f73e8cda716b46aeddb57b88fa47/objects/f9c1fbee03eb653c589cf9d4f20952c7a1a19e4c4bc698d494f0d130428ca675:1,2`
- `fragments/3886cff4bc3dcf39ad8a48e71411beeac6ee45fcdb85b8772e4208fd0916016a/objects/5cfd53581281cc6ae0506a72188d15dd6532a4ceae59e69c63cec77793502dc9:2`
- `fragments/3886cff4bc3dcf39ad8a48e71411beeac6ee45fcdb85b8772e4208fd0916016a/objects/0f6b22ccbe9b4c487c39cf4c684754735f49b478c8310df34d760047218f316a:1,2`
- `fragments/72ba28f5341b3bf45457a31bf338af5a8d9348207edc959a4c4f5fcd09976e0b/objects/c26260087abda15d05235f9200edcf9d13bbd0e63587be64cc8b3d85c204b507:31`
- `fragments/0b984ff37adcb8c145fc9b91ea046c2ca28b8fe48deb27039bb5f2977dc7ec02/objects/0179dfa1224f4d3386b37d1c7ecff706a2086affb8bad64eceea39f75f70dd33:1,2`
- `fragments/0b984ff37adcb8c145fc9b91ea046c2ca28b8fe48deb27039bb5f2977dc7ec02/objects/f378b29cad17bd9665a144d771e9ca16598b19688995098812cc90abcb2859a7:2`
- `fragments/a16b2feb33ee4bb4f236794db74c10b063f9b0005ca532cfebc6d5b608204854/objects/d8ebce02b38cb90ba120c27fae411ff23c1891f395cc8d221378acfc72659649:1,2`
- `fragments/a16b2feb33ee4bb4f236794db74c10b063f9b0005ca532cfebc6d5b608204854/objects/1cf30f0d2f1dbb82539b1acf5cfd0b86d7d9c30796b9afe0ecfc80dae0bfe34a:2`
- `fragments/ab24e5b4858629e2c94086e77bf28d49f88133c0b7e281e3641531c8ffbba49a/objects/4430d9742f194df3676cb6917ae9941354025598a41c60ea7efaa6d1a859e8d0:7`
- `fragments/ab24e5b4858629e2c94086e77bf28d49f88133c0b7e281e3641531c8ffbba49a/objects/a379dbeb560934f8445bb20129ef927a407d93806453399a2018e56447650c9d:2`
- `fragments/da82da934757021f83870a177ff310ca50bf8b7c4513f14a0f2432da380e9661/objects/5988f69f3bc31e8f34388914ec588da737b1a1b1e5ed7838cb468b22b68d5772:1,2`
- `fragments/da82da934757021f83870a177ff310ca50bf8b7c4513f14a0f2432da380e9661/objects/f8a22d6db81c20f0c77fd120ec976a1dcae68a79ca09e55243453ea121a20c2e:2`
- `fragments/2cba19243f1daa191f6704c0e1123607a479619d4cbd05d88d398c3db4d9fdff/objects/9884fdd6c990f289d644988f719bf0f6aed091c5fdbf9e2f5b01bdcce0530c31:7`
- `fragments/2cba19243f1daa191f6704c0e1123607a479619d4cbd05d88d398c3db4d9fdff/objects/11d5ed27fd406d415b9898b5ef10257403c4dc19595f0b3350290e8592bc4121:7`
- `fragments/2cba19243f1daa191f6704c0e1123607a479619d4cbd05d88d398c3db4d9fdff/objects/eab8135a69dd31d3fd38dd2505bbbdc4807b52790066379adf0cd3df253c8dc9:7`
- `fragments/2cba19243f1daa191f6704c0e1123607a479619d4cbd05d88d398c3db4d9fdff/objects/a4b4c46c099b5d1a9d20788e98f238c2cf99c875ad5e52c5de67a63d226ef245:7`
- `fragments/2cba19243f1daa191f6704c0e1123607a479619d4cbd05d88d398c3db4d9fdff/objects/1fb1f15d0c0a20e1f037c58b9ccae28d624165a2d75d5d4a6decd111af30cfd0:8`
- `fragments/2cba19243f1daa191f6704c0e1123607a479619d4cbd05d88d398c3db4d9fdff/objects/1c5c960179bdfb85872d1191a24ca755c9c5f457464eb29068c7c0563bd1f662:7`
- `fragments/2cba19243f1daa191f6704c0e1123607a479619d4cbd05d88d398c3db4d9fdff/objects/c3e74a82cc9ce6f324e6425dd0baffb72a0d522cc6f5b6c1b87d36d47634d8e2:7`
- `fragments/2cba19243f1daa191f6704c0e1123607a479619d4cbd05d88d398c3db4d9fdff/objects/414a3fda8d4fdc9df1cd2f977871fcee1e9d0565241eb8906b90f585f8d68472:8`
- `fragments/2cba19243f1daa191f6704c0e1123607a479619d4cbd05d88d398c3db4d9fdff/objects/a65bcc2ead5de0e86d1ed4f09e53cb421098f5972ab79e7da26bb547d282d7e1:7`
- `fragments/2cba19243f1daa191f6704c0e1123607a479619d4cbd05d88d398c3db4d9fdff/objects/2883e24669b061d3db72a76504bb9fe5e02785e51770d29b30efb21ca9dbe49e:8`
- `fragments/2cba19243f1daa191f6704c0e1123607a479619d4cbd05d88d398c3db4d9fdff/objects/f41154a3af440e6c7ebb72c3bff8d831a2e41a92d987929884c90c9a0c0cc679:7`
- `fragments/2cba19243f1daa191f6704c0e1123607a479619d4cbd05d88d398c3db4d9fdff/objects/58704b5df841672ead61a76eb14cbe5762eda46abe62a2d5b77dbcd68a7df545:7`
- `fragments/2cba19243f1daa191f6704c0e1123607a479619d4cbd05d88d398c3db4d9fdff/objects/e0fca2baecd5cd894fc48dd92001f752564a18b8d9beac53b9fd31ac3aa12946:7`
- `fragments/2cba19243f1daa191f6704c0e1123607a479619d4cbd05d88d398c3db4d9fdff/objects/05d3a6cec7a82f060b708a9d2a09d5fdf5db23fc7cb00342081e8d7db8bf0a98:7`
- `fragments/2cba19243f1daa191f6704c0e1123607a479619d4cbd05d88d398c3db4d9fdff/objects/10bed26a6b6b2d377861ae934627e382b023d4b128cf90976cdbd368123e595e:7`
- `fragments/ca853683b55402dac868d9f23b61bc60ae1f7eaa9726eeb71e2e3f40bf962f54/objects/5cdba47d1cc9bc3b867d7ff31d65d8f43d082ca79323ac48d034baabaeb263a9:2`
- `fragments/ca853683b55402dac868d9f23b61bc60ae1f7eaa9726eeb71e2e3f40bf962f54/objects/a6988857f73282418e5056163bc91caddbac8f70d0e6832015fee7d3f1604356:7`
- `fragments/33d168249a78cb5a63385e7d5aa92698c090abe8f2522f5fd3f2c4810002d123/objects/ec5ef4c6081769390e898ac74dba989d9375eb8b5455e063fb807a1338c115cf:2`
- `fragments/33d168249a78cb5a63385e7d5aa92698c090abe8f2522f5fd3f2c4810002d123/objects/613bcbd7effc4a462ea79eff4c9317c8f566d9344f77a4df0ac7f2d2585032fa:1,2`
- `fragments/4cca978ef4da614a597b908a7023ebfa048c877e7875b8978a9b5e25501931fe/objects/f22dbe02e65c74feaef9cb5c2325932dcf8f32ea680e54884cabe737870dbe6d:2`
- `fragments/4cca978ef4da614a597b908a7023ebfa048c877e7875b8978a9b5e25501931fe/objects/74595b81878cdbb0526a4ff344d10a1e5a149a28525bdb3453cfea67feaa6a97:1,2`
- `fragments/a5f9701d40177b0555ca2b6aefba446c4d68f86fcfb257e80874fc658e1040ed/objects/8869a2f4e11e017d336cdcd904cbe41a50f8140f4689d3b5ed9bcd225abadf83:7`
- `fragments/a5f9701d40177b0555ca2b6aefba446c4d68f86fcfb257e80874fc658e1040ed/objects/595afd7fdf53aa2bdfd6fffe1fe0f8e42af3f940a6cd7c50b555e5cbdd8f0e87:2`
- `fragments/90dcee631ad7352105fa123a15cc3e0cec924a28f53b73a1410daea24309c6e2/objects/4f43f5f588e23f6d31fd0b5106e0aa2ba7978fdce4ef6d34642c07b187529a4c:1,2`
- `fragments/90dcee631ad7352105fa123a15cc3e0cec924a28f53b73a1410daea24309c6e2/objects/46528a6596ef3e34bed60b50fcf035ad43dc0d91aeea73a3b3e901ca81e9f2e7:2`
- `fragments/66f1c28ae847b23c1dcb91b6d0d7efbe739cbae9b88e117648a3c922a6f7a6ce/objects/a2bfa1ee9e8bd6792f7a56e5341cbcc160ae6d8aac4d5a1eb69415f20f4b7a51:2`
- `fragments/66f1c28ae847b23c1dcb91b6d0d7efbe739cbae9b88e117648a3c922a6f7a6ce/objects/6ef357e94621ba4baa6f025bb1a1c33abb18eb17876aacc15531799c65b61a50:1,2`
- `fragments/53f5d76d956d4a1bb7d01375f2ea813a2d89bb7e636b470b6fec7aae0056f3c9/objects/1a9e130e22c36478c479955280e0323cb7fd5c7923f774912392cd459817ecd2:7`
- `fragments/53f5d76d956d4a1bb7d01375f2ea813a2d89bb7e636b470b6fec7aae0056f3c9/objects/2a8d44a788f385188544f413bf365843b1b35e52bd4373adf877a7c1e6ba185e:2`
- `fragments/5fde98bb7d3f4292187f90bc4df5358aec539fddf141f6dd929aabaa7c4afbec/objects/434695383dba46e6bdd22b399602cbd39cd9cb7fa1db4aad266226a24a4bcaab:2`
- `fragments/5fde98bb7d3f4292187f90bc4df5358aec539fddf141f6dd929aabaa7c4afbec/objects/fb4d42c249c77cff6fea224ff2704e2b3ddf6327276253a2db8fa23fd9614ccf:1,2`
- `fragments/bda70a60ebc1b22720edb062440effcd03f5949f30204f1f237272b3d0d05eae/objects/2cd60e709144e7ab1be2da33dfa2894781bbe5093447e2314f855ccf3a2a22f5:2`
- `fragments/bda70a60ebc1b22720edb062440effcd03f5949f30204f1f237272b3d0d05eae/objects/e2feec64e130f8f62186dacb10fbee6cf10e1e5a44ea5bceff202a17f6e6ebbe:7`
- `fragments/fab677a6641694773605446b3319014fc5983acdcdfef77ea43d5fdbf096a40c/objects/39544f9a87392288cb86f0818e335026d0218bccbd873c42cfc2597761254970:1,2`
- `fragments/fab677a6641694773605446b3319014fc5983acdcdfef77ea43d5fdbf096a40c/objects/77e444cb277776f0a8ea5c24d34f3a74c2d8674bd10c530f42413150c5a96ea8:2`
- `fragments/7409e86fc9859c0aa8162a6e92b94c8208b9c976b0ef201b2618e29ad1df214a/objects/b8436560bfa119bc42d22196e8990b38103f3231c64bc0b5ac3ddd0098411859:2`
- `fragments/7409e86fc9859c0aa8162a6e92b94c8208b9c976b0ef201b2618e29ad1df214a/objects/05177abe78317173a9eba1393bd97fd1990d19563d941006702cdaf07885a73e:7`
- `fragments/9c5b73defa40732512d69ee9d7660b57cd230b9061280938dfc29066f3a4e77a/objects/5f6af792927d55124377815ee9784e41a0b2d10434d83178a5d2c0a3088392ac:2`
- `fragments/9c5b73defa40732512d69ee9d7660b57cd230b9061280938dfc29066f3a4e77a/objects/da96b7ac064f7a1dc6d236abf01dd022cb2018b042c1cdc1285255707616b279:1,2`
- `fragments/225f2511cc62dc3dfce851cbf325bc3c411c10729b57742343b811d12fc847d1/objects/e13fcae1d109654d054b0384bddf9f31e7ce4a585b1d76b24cbcd2a6bdd9b5db:2`
- `fragments/225f2511cc62dc3dfce851cbf325bc3c411c10729b57742343b811d12fc847d1/objects/05afc867e8e507a14c1e16d42abff23c75eda53d33714c574886220149843eba:1,2`
- `fragments/ef6e8bc1c48c092c0c2c783c5fca44d313d23e062603df4ae4d8c50255c7a7c4/objects/795954eb858e335d551e7c4a1a5b1638a252709de354c9fbb4a0de0c744a255a:7,15`
- `fragments/ef6e8bc1c48c092c0c2c783c5fca44d313d23e062603df4ae4d8c50255c7a7c4/objects/f987d7bd29724b4697db7ba688a435ac60176801b506fb27b82ffe9c51d447ea:7`
- `fragments/f628c07bb815e8a33ea35d13d0234a8c08ea76a27aabea848aa98cde183d8dd9/objects/65a6354595731e955281908ad16f15174f0f251933b69b5c7a31227ea78c99b4:7`
- `fragments/f628c07bb815e8a33ea35d13d0234a8c08ea76a27aabea848aa98cde183d8dd9/objects/94a1406c4e46322a832420084ebca425e81844eae84f98fbb0ba47e530a0647d:2`
- `fragments/2293f7a56f534e70925bf6492cbcd68b015255de13a8493fe469be63e20d8d72/objects/79ebdad7684508787c5530f3b92169e623a1222243bcd4521d1f83fca323cbae:2`
- `fragments/a7ad6045067c57c3cd4fa63040ccdfcb25c10429dc4aadfa592185d9ddcf95cd/objects/2df4ad0f07893a23599e1ed0a7670d57e2a995ee7340c2c7feb6c7066eda8608:15`
- `fragments/2293f7a56f534e70925bf6492cbcd68b015255de13a8493fe469be63e20d8d72/objects/c791a38ba53cd8f3106ced1cc14ab8393d9b6c2ae9dd8ee90f84892453031947:1,2`
- `fragments/a7ad6045067c57c3cd4fa63040ccdfcb25c10429dc4aadfa592185d9ddcf95cd/objects/c5e21fc6ac8a51c1896209e736ef099321e9b97457c7114826f1f96fadda575b:10`
- `fragments/a7ad6045067c57c3cd4fa63040ccdfcb25c10429dc4aadfa592185d9ddcf95cd/objects/387cc1a8265ce88d2d113c2f62c429b36a59c47e3418c283bc3e5a2ff4074aee:10`
- `fragments/30883f062abbf607e35b9b0207e995327b56295d1060ec127c92016892479fbe/objects/86957c0e3e3e02446fba3579eaa08ab5a9b53f155e37689da32803ce292b69aa:7`
- `fragments/30883f062abbf607e35b9b0207e995327b56295d1060ec127c92016892479fbe/objects/ab2a0d5d949f9a0f135e281cc6b9530148e0b25ad756f3ccfbda66d21fea1565:2`
- `fragments/a7ad6045067c57c3cd4fa63040ccdfcb25c10429dc4aadfa592185d9ddcf95cd/objects/6166cdf8901451b3294a576a28c2b28c7906e54388cb0b8939c9fff0ec696e35:8`
- `fragments/0d24bddad4ebf2459c69f0b8f54ae3d5073889518761f6798a67ba18f712d18f/objects/c2d6a79d6275365fa4a1e84df4a8cf141bf722c500c248190f45ee3bdf3bf265:7`
- `fragments/0d24bddad4ebf2459c69f0b8f54ae3d5073889518761f6798a67ba18f712d18f/objects/9321132ab9d08a2e0805413a30993b603eaec5539a543bd4105ec24fbc45b3fc:2`
- `fragments/cf37a11570e20a318833f2882b7b7a20ee2adee00ab0e88660b1412f6d17cc25/objects/8d5a9bf3113ab9faa89178a64acbee24e9bdfc4622f3a1ae40a8f9dc437d34ed:7`
- `fragments/cf37a11570e20a318833f2882b7b7a20ee2adee00ab0e88660b1412f6d17cc25/objects/1e52395f625688335c0207bede9c276e718fb5cfa3e313d08ab46c9e77ccbc33:2`


## After rename search: /home/fuyu/Workspace/example-service

No matching callers or mentions (search exit 1).


## After rename search: /home/fuyu/Workspace/Example-notebook

No matching callers or mentions (search exit 1).


## After rename search: /home/fuyu/Workspace/soks

No matching callers or mentions (search exit 1).


## After rename search: /home/fuyu/Workspace/example-skills

No matching callers or mentions (search exit 1).


## After rename search: /home/fuyu/Workspace/example-learner

- `.agents/hooks/stop.test.ts:52,89`
- `.agents/hooks/lanes.ts:102,103`
- `launcher/designs/lin-v0/lin-preregistration.json:3`


## Rendered global guidance

- `/home/fuyu/.claude/CLAUDE.md:10,57,58,59,62,63,64,69,72`

## Additional argv and binary-name candidates

Query `["']agx["']` catches arrays split across lines and variable assignments. These references include bin declarations and availability checks; they are candidates, not all executable calls. Raw snippets: `/tmp/agx-suite-argv-callers.json`.

### /home/fuyu/dotfiles.ws/ws_agx-suite-thin

- `package.json:24`
- `scripts/tests/doctor.test.ts:81,93,104`
- `agents/claude/hooks/bash-durations.ts:48`
- `scripts/agx-accept.ts:150`
- `scripts/doctor.ts:1971,1972,1976,1979,1982,2090`
- `scripts/tests/land.test.ts:73,75,76,81,335,787,791,795,797,858,865,908,928,1030,1076,1121,1688,1692,1696,1945`
- `scripts/tests/bun-path.test.ts:59`
- `scripts/tests/agx-accept.test.ts:125,132`
- `scripts/tests/agx-doctor.test.ts:143`
- `tools/agx/src/agx.ts:52`
- `tools/agx/package.json:7`
- `tools/agx-ticket/tests/lifecycle.test.ts:64`
- `tools/agx-ticket/src/tickets.ts:392,559`
- `tools/statusline/tests/step3.test.ts:86`
- `tools/statusline/tests/fleet-line.test.ts:22`
- `tools/statusline/tests/dispatch-state.test.ts:13`
- `tools/statusline/tests/render-golden.test.ts:94`
- `tools/statusline/tests/entry-parity.test.ts:385,494`
- `tools/statusline/tests/statusline-run-row.test.ts:807,1308`
- `tools/statusline/tests/field-state.test.ts:119,159,332,404`
- `tools/statusline/src/dispatch-runs.ts:245`
- `tools/statusline/src/core-runs.ts:58`
- `tools/statusline/src/field-state.ts:41,48`
- `tools/agx-worker/tests/codex.test.ts:226`
- `tools/statusline/src/format.ts:255,256`
- `tools/agx-worker/src/workers/codex.ts:180`
- `tools/statusline/src/row-state.ts:11,25,37,39`
- `tools/agx-worker/src/workers/codex-host.ts:29,51`
- `tools/agx-worker/src/temp.ts:28`
- `tools/agx-worker/docs/suite-callers.md:9`
- `.agents/tickets/ratecontext2.md:4`
- `.agents/tickets/agxspin.md:4`
- `tools/agx-ws/tests/add-hang.test.ts:30`
- `.agents/tickets/ratecontext3.md:4`
- `tools/shared/src/test-tmp.ts:187`
- `tools/shared/src/dispatch-state.ts:6`
- `.agents/tickets/ratecontext.md:4`
- `tools/storage-headroom/src/decision.ts:561`
- `tools/statusline/src/build-dataframe.ts:330`
- `tools/agx-worker/tests/startup.test.ts:45`
- `tools/agx-ws/src/workspace.ts:657,659`
- `tools/agx-ws/tests/workspace.test.ts:101,943,946,1174,1254`
- `tools/agx-ws/tests/lock-scope.test.ts:79,230`
- `tools/shared/tests/dispatch-state.test.ts:63,65`
- `tools/agx-worker/src/next/store.ts:240`

### /home/fuyu/dotfiles

- `package.json:24`
- `scripts/agx-accept.ts:150`
- `scripts/doctor.ts:1967,1971,1972,1976,1979,1982,2090`
- `tools/agx-ws/tests/add-hang.test.ts:30`
- `tools/agx-ws/tests/lock-scope.test.ts:79,230`
- `tools/agx-ws/tests/workspace.test.ts:101,943,946,1174,1254`
- `tools/agx-ws/src/workspace.ts:657,659`
- `scripts/tests/land.test.ts:73,75,76,81,335,784,788,792,794,855,862,905,925,1027,1073,1118,1685,1689,1693,1942`
- `scripts/tests/doctor.test.ts:81,93,104`
- `scripts/tests/agx-accept.test.ts:125,132`
- `scripts/tests/bun-path.test.ts:59`
- `tools/agx-run/src/next/cli.ts:34`
- `tools/agx-run/tests/startup.test.ts:45`
- `tools/agx-run/tests/codex.test.ts:226`
- `tools/agx-run/src/next/store.ts:240`
- `tools/agx/tests/dispatch.test.ts:110`
- `tools/agx/tests/doctor.test.ts:115`
- `tools/agx/src/agx.ts:8`
- `tools/agx/src/dispatch.ts:140,321`
- `tools/agx/package.json:7`
- `tools/agx-run/src/workers/codex.ts:180`
- `tools/agx-run/src/workers/codex-host.ts:29,51`
- `tools/agx-run/src/temp.ts:28`
- `tools/statusline/tests/step3.test.ts:86`
- `tools/statusline/tests/fleet-line.test.ts:22`
- `tools/agx-ticket/tests/lifecycle.test.ts:64`
- `tools/statusline/tests/dispatch-state.test.ts:12`
- `tools/statusline/tests/render-golden.test.ts:91`
- `tools/statusline/tests/entry-parity.test.ts:385,494`
- `.agents/tickets/ratecontext3.md:4`
- `.agents/tickets/ratecontext2.md:4`
- `tools/agx-ticket/src/tickets.ts:392,559`
- `.agents/tickets/agxspin.md:4`
- `.agents/tickets/ratecontext.md:4`
- `tools/statusline/tests/statusline-run-row.test.ts:801,1302`
- `tools/statusline/tests/field-state.test.ts:119,156,327,399`
- `tools/statusline/src/dispatch-runs.ts:246`
- `tools/statusline/src/core-runs.ts:58`
- `tools/statusline/src/field-state.ts:41,48`
- `tools/statusline/src/row-state.ts:11,25,37,39`
- `tools/statusline/src/build-dataframe.ts:330`
- `agents/claude/hooks/bash-durations.ts:48`
- `tools/storage-headroom/src/decision.ts:561`
- `tools/shared/tests/dispatch-state.test.ts:63,65`
- `tools/shared/src/test-tmp.ts:187`
- `tools/shared/src/dispatch-state.ts:6`

### /home/fuyu/Workspace/Example-science

No matching literal bin names.

### /home/fuyu/Workspace/retrospectives

No matching literal bin names.

### /home/fuyu/Workspace/Coral-dpp

No matching literal bin names.

### /home/fuyu/Workspace/dx

- `docs/spec.md:265`
- `.agents/tickets/dx-review.md:25`
- `.agents/tickets/jev-contract.md:20`
- `src/config.ts:16`
- `README.md:295`
- `tests/contracts.test.ts:236`

### /home/fuyu/Workspace/example-app

No matching literal bin names.

### /home/fuyu/Workspace/example-search-v1

No matching literal bin names.

### /home/fuyu/Workspace/example-suite-monorepo

No matching literal bin names.

### /home/fuyu/Workspace/example-records-v2

No matching literal bin names.

### /home/fuyu/Workspace/example-search

No matching literal bin names.

### /home/fuyu/Workspace/example-records-v1

No matching literal bin names.

### /home/fuyu/Workspace/example-service

No matching literal bin names.

### /home/fuyu/Workspace/Example-notebook

No matching literal bin names.

### /home/fuyu/Workspace/soks

No matching literal bin names.

### /home/fuyu/Workspace/example-skills

No matching literal bin names.

### /home/fuyu/Workspace/example-learner

- `.agents/hooks/lanes.ts:98,106,107`
