+++
schema = 2
name = "test-tmp"
outcome = "no dotfiles test leaves anything in /tmp: a bun test preload (bunfig.toml [test] preload) gives each test process its own TMPDIR under one per-run parent and removes it at exit; the gate records the /tmp top-level listing before and after and fails on any new entry; test helpers that call mkdtemp use os.tmpdir() (which honors TMPDIR)"
writes = ["bunfig.toml", "tools/shared/src/test-tmp.ts", "tools/shared/tests/test-tmp.test.ts", "scripts/lint-tmp-leaks.ts", "scripts/tests/lint-tmp-leaks.test.ts", "agents/hooks/tests/enforce-search-route.test.ts", "scripts/tests/ccc-swap.test.ts", "scripts/tests/doctor.test.ts", "scripts/tests/link-dots.test.ts", "tools/repo-retrieve/tests/repo-retrieve.test.ts", "tools/storage-headroom/tests/decision.test.ts", "agents/skills/linting-prose/tests/**", "tools/*/.changes/*.md"]
verify = ["bun test tools/shared/tests/test-tmp.test.ts", "bun test scripts/tests/lint-tmp-leaks.test.ts", "mise run gate:land"]
timeout_s = 2400
premises = ["file:scripts/tests/doctor.test.ts"]

[proposition]
id = "TESTS-OWN-TMP"
claim = "running the full gate leaves zero new top-level entries in /tmp, and so does a test process killed mid-run (its per-run parent is removed by the next run or by the preload's exit handler)"
refuted_by = "any new /tmp entry after a gate run or a killed test"
+++

Root fix B of /home/fuyu/Workspace/retrospectives/2026-10-15-tmp-ownership-retro.md. Leaking prefixes seen today:
repo-retrieve-bin, repo-retrieve-project, search-route-*, doctor-*, link-dots-*, ccc-*, storage-*, skills-floor-*.
Run `rr exists 'create a temporary directory for tests'` first and reuse what exists. Wire the leak gate into the
existing lint entry that gate:land runs without editing mise.toml; if mise.toml is needed, list the exact lines.
All test data goes under TMPDIR, never /tmp; never delete existing /tmp entries. Changesets via `mise run changeset`.
Do not commit or push.

## Current state (coordinator, 21:32)
Run 5af55a76: all tests pass; gate:land fails only at `[lint:ts]`. Run `mise run lint:ts`, fix every diagnostic in your files without disabling rules, re-run verify.
