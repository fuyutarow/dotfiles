+++
schema = 2
name = "tmp-leaks"
outcome = "no dotfiles test and no agx run leaves anything in /tmp: test temp dirs are created under one per-run parent (TMPDIR set by the test runner) that the runner removes on exit, including timeouts and kills; agx's agx-host-* dirs are removed at run end, including abnormal ends; a gate fails when one gate run leaves a new top-level entry in /tmp"
writes = ["agents/hooks/tests/enforce-search-route.test.ts", "scripts/tests/ccc-swap.test.ts", "scripts/tests/doctor.test.ts", "scripts/tests/link-dots.test.ts", "tools/repo-retrieve/tests/repo-retrieve.test.ts", "tools/storage-headroom/tests/decision.test.ts", "tools/agx/src/**", "tools/agx/tests/**", "tools/shared/src/temp-root.ts", "tools/shared/tests/temp-root.test.ts", "bunfig.toml", "scripts/lint-tmp-leaks.ts", "scripts/tests/lint-tmp-leaks.test.ts", "tools/*/.changes/*.md"]
verify = ["bun test tools/shared/tests/temp-root.test.ts", "bun test scripts/tests/lint-tmp-leaks.test.ts", "mise run gate:land"]
timeout_s = 3600
premises = ["file:scripts/tests/doctor.test.ts", "file:tools/agx/src/next/run.ts"]

[proposition]
id = "NO-TMP-LEAK"
claim = "running the full gate once, and once more with a test killed by timeout, leaves zero new top-level entries in /tmp; an agx probe run that is killed leaves no agx-host-* dir"
refuted_by = "any new /tmp top-level entry after a gate run or a killed test, or an agx-host-* dir after a killed agx run"
+++

Postmortem N1 (/home/fuyu/Workspace/retrospectives/2026-10-15-disk-tmp-exhaustion-postmortem.md); this is the 10-12
retro's unimplemented R4 and the root of the third /tmp inode exhaustion. Evidence: ~100k /tmp entries named
repo-retrieve-bin, search-route-bin, repo-retrieve-project, doctor-bun-cache, search-route-project, doctor-home,
link-dots-repo, link-dots-home, search-route-syntax(-bin), doctor-ssh, ccc-swap-home, storage-cfg, ccc-systemd,
storage-cache-home (from the 6 test files in writes) plus many agx-host-*. Tests that time out are killed before
their cleanup. Run `rr exists 'create a temporary directory for tests'` first and reuse what exists. Wire the gate
into the existing lint entry that gate:land runs without editing mise.toml; if mise.toml is required, list the lines.
Do not run anything that deletes existing /tmp entries. Changesets via `mise run changeset`. Do not commit or push.
