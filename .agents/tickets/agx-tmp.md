+++
schema = 2
name = "agx-tmp"
outcome = "every agx run owns its temp space: agx creates a per-run directory under ~/.cache/agx/tmp/<run-id>, points the worker's TMPDIR (and TMP, TEMP) at it, and removes it when the run ends, including abnormal ends; a directory left by a killed agx is removed by the next agx run when its recorded pid is dead; agx's own host temp dirs (agx-host-*) live there too, never directly under /tmp; agx refuses to start a worker when TMPDIR would resolve to /tmp itself"
writes = ["tools/agx/src/**", "tools/agx/tests/**", "tools/*/.changes/*.md"]
verify = ["bun test tools/agx", "mise run gate:land"]
timeout_s = 2400
premises = ["file:tools/agx/src/next/run.ts"]

[proposition]
id = "AGX-OWNS-TMP"
claim = "a fixture run leaves nothing under /tmp; a fixture run killed with SIGKILL leaves its dir, and the next run removes it; the worker sees TMPDIR=~/.cache/agx/tmp/<run-id>"
refuted_by = "any new /tmp entry after a fixture run, or a leftover per-run dir after the next run"
+++

Root fix A of /home/fuyu/Workspace/retrospectives/2026-10-15-tmp-ownership-retro.md (4 /tmp inode exhaustions:
10-12 twice, 10-15 twice; tens of thousands of agx-host-* and test temp dirs left by killed runs). Owner of a
thing cleans it (Unix); the cleaner tool is only a backstop. All fixtures and test data in this ticket go under
TMPDIR, never /tmp. Probe against a temp AGX_NEXT_STATE_DIR. Changesets via `mise run changeset`
(MISE_TRUSTED_CONFIG_PATHS=$PWD MISE_STATE_DIR=$(mktemp -d)). Do not commit or push.

## Current state (coordinator, 21:32)
Run 0c0fde5d: tests pass except the known alpha-wide `stale consumer link` test (ignore it); gate:land fails only at `[lint:ts]`. Run `mise run lint:ts`, fix every diagnostic in your files without disabling rules, re-run verify.
