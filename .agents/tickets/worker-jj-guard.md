+++
schema = 2
name = "worker-jj-guard"
outcome = "inside an agx worker (codex or claude route), shell commands that rewrite shared jj state are refused before they run: jj op restore, jj op revert, jj undo, jj abandon, jj squash, jj bookmark set/move/delete/forget, jj git push, jj rebase (any form), jj workspace forget; read-only jj commands (log, st, diff, show, file, resolve --list, op log) stay allowed; the coordinator's own sessions are unaffected"
writes = ["agents/hooks/**", "agents/codex/**", "tools/agx/src/workers/**", "tools/agx/tests/**", "tools/shared/src/**", "tools/shared/tests/**", "tools/*/.changes/*.md"]
verify = ["bun test agents/hooks", "bun test tools/agx", "mise run gate:land"]
timeout_s = 2400
premises = ["file:agents/hooks/hooks.toml"]

[proposition]
id = "WORKER-NO-SHARED-JJ-REWRITE"
claim = "in a fixture worker context on each route, every listed mutating jj command is refused with a one-line reason and no operation is written to the op log, while jj log/st/diff/resolve --list succeed; outside a worker context the same commands are not blocked by this guard"
refuted_by = "a listed command reaches jj from a worker on either route, a read-only command is refused, or the guard fires in a non-worker session"
+++

Reported by coralbase-agt_6n0x (2026-10-15): worker merge20 (run 0ea6743b) ran `jj op restore` inside its workspace to
undo an auto snapshot; op restore rewinds the whole repo view (all workspaces and bookmarks), op 5c2b1665. Nothing was
lost only because the only intervening operation was that snapshot. Charter rule: a worker never rewinds shared state.
Decide how a guard knows it is inside an agx worker (an env var agx sets for both routes, or the worker sandbox), and
enforce it where both routes pass (codex has no Claude PreToolUse hooks: the guard must also cover codex, e.g. a jj
wrapper first on the worker PATH, or the codex exec policy). Parse with tools/shared's Bash parser; an unparsable
statement containing `jj` plus a listed verb is refused (fail first) with the reason. Do not commit or push.

## Current state (coordinator, 00:15)
The previous run (903de1e2) left this workspace with failing verify. Its first failing lines:
(fail) real TypeScript checking sees workspace types through a stale consumer link without writing it [22600.91ms]
[lint:bun] floor: FAIL=0 WARN=7 (files=265) — structure only; BG1-BG4 judgment is not covered
Continue from the workspace as it stands: fix these without disabling rules, re-run verify. A failure in
"stale consumer link" is a known pre-existing test failure owned by another ticket; ignore only that one.
config-map findings on zero-byte sandbox placeholder files (.claude/launch.json and peers) are removed by the
coordinator before land; ignore only those. Test data outside the workspace. Do not commit or push.
