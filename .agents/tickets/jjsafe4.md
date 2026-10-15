+++
schema = 2
name = "jjsafe4"
outcome = "no stop of a worker unit, deadline or harness timeout can terminate a jj/git process while it may be writing refs in a shared store: every jj/git invocation in tools/agx, agents/hooks, agents/claude/hooks and tools/repo-retrieve either runs outside any killable unit and outside kill-on-timeout wrappers, or provably writes no refs; a deadline only warns, never kills jj"
writes = ["tools/agx/**", "agents/hooks/**", "agents/claude/hooks/**", "tools/repo-retrieve/**", "tools/shared/src/jj-read.ts", "tools/shared/src/readonly-*.ts", "tools/shared/src/store-flock.ts", "tools/shared/tests/**", "tools/*/.changes/*.md"]
verify = ["bun test tools/agx", "bun test agents/hooks", "bun test tools/repo-retrieve", "mise run gate:land"]
timeout_s = 3600
premises = ["file:tools/agx/src/workers/codex.ts"]

[proposition]
id = "NO-KILLABLE-REF-WRITER"
claim = "an inventory of every jj/git call site in the four trees shows each is outside any killable unit/deadline or provably ref-free; a fixture that stops a worker unit mid-run leaves no jj process killed"
refuted_by = "an inventoried call site runs a ref-writing jj under a timeout kill or inside a worker unit"
+++

Facts (runs 62de202e, 64433040, 5f047c43, aac5a05a; soks urn:uuid:01a13e57-85e6-7654-9384-712e9f0d67d1):
- KillMode=mixed + TimeoutStopSec only delays SIGKILL; a unit stop kills its whole cgroup; agx runs inside the unit.
- jj 0.46.0 can write refs/jj/keep/* even with --ignore-working-copy --at-operation=@ (JJREF-004); no flag stops all
  ref writes (JJREF-005); export writes refs one at a time before the op is published (JJREF-006). State the rule's
  reason as "consistency after an interrupted jj is not guaranteed" (corruption is not demonstrated).
- Worker sandboxes cannot write the shared .jj store. tools/agx/src/workers/codex.ts:503 uses SIGKILL.
Mechanism is your call (e.g. run each harness jj that may write refs in its own transient user unit outside the
worker cgroup, or route them through one serialized helper unit never stopped by worker stops). Return only with a
proof that no mechanism can satisfy the invariant.
Scope (owner decision 2026-10-15): workspace creation/removal is NOT agx's job (tools/agx/docs/scope.md); ticket
workspace-tool builds the standalone `ws` tool and takes over the workspace code already written in this workspace
(tools/shared/src/jj-workspace.ts, workspace-policy.ts and any `agx ws` wiring). Remove that code and any `agx ws`
subcommand from this change; keep the read-only jj helpers and the store flock if your invariant uses them.
Probe agx against a temp AGX_NEXT_STATE_DIR. Changesets via `mise run changeset`. Do not commit or push.

## Current state (coordinator, 00:24)
The previous run (6b748f12) left this workspace with failing verify. Its first failing lines:
(fail) real TypeScript checking sees workspace types through a stale consumer link without writing it [12988.70ms]
Continue from the workspace as it stands: fix these without disabling rules, re-run verify. A failure in
"stale consumer link" is a known pre-existing test failure owned by another ticket; ignore only that one.
config-map findings on zero-byte sandbox placeholder files (.claude/launch.json and peers) are removed by the
coordinator before land; ignore only those. Test data outside the workspace. Do not commit or push.
