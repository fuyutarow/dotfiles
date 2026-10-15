+++
schema = 2
name = "agx-ls-wait"
outcome = "`agx ls --wait <selector>` blocks until at least one selected run reaches a terminal state (ended, orphaned) and then prints that run's row (same format as `agx ls`, JSON with --json) and exits 0; it holds no state of its own (a fold over the records file, re-read on change or at a bounded poll interval); an ambiguous or empty selector fails at once with a non-zero exit and a message; a run that ends without a final report is still returned (with its outcome), so a missing report cannot hide a finished run"
writes = ["tools/agx/src/next/cli.ts", "tools/agx/src/next/commands.ts", "tools/agx/src/next/wait*.ts", "tools/agx/tests/**", "tools/agx/docs/scope.md", "tools/*/.changes/*.md"]
verify = ["bun test tools/agx/tests", "mise run lint:ts", "mise run lint:bun"]
timeout_s = 2400
premises = ["file:tools/agx/src/next/cli.ts", "file:tools/agx/docs/scope.md", "file:tools/spec/architecture.md"]

[proposition]
id = "AGX-LS-WAIT"
claim = "fixtures: --wait on a running run returns its row within one poll after an ended record is appended; on an already-ended run returns at once; on a run whose process dies without an ended record returns it as orphaned; on an unknown selector exits non-zero immediately; no file is written by --wait"
refuted_by = "a wait that misses a finished run, writes state, or hangs on an invalid selector"
+++

Architecture R1 (tools/spec/architecture.md:211): the 2026-10-14 switch removed waiting from agx on purpose
(tools/agx/docs/scope.md), so the replacement must be a fold over records, not state (I11). Update scope.md's table to
say `ls --wait` is a read-only fold. Field reports: polysearch verifybig 739fb427 ended with no final report and went
unnoticed; earlier perf_gf2 and mod_merge_r were missed; watch loops were refused by the background-wait hook. Do not edit
tools/agx/src/next/run.ts (ticket agx-verify-env owns it). Test data outside the workspace. Do not commit or push.
