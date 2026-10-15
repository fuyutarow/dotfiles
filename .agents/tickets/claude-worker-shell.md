+++
schema = 2
name = "claude-worker-shell"
outcome = "an agx worker on a claude roster row at sandbox=workspace-write can run shell commands (the ticket's verify, tests, linters, bunx) inside its workspace without an interactive approval, can read files outside the workspace, and still cannot write outside the workspace; read-only and none keep their meaning; behavior matches the codex route's workspace-write contract"
writes = ["tools/agx/src/next/run.ts", "tools/agx/src/workers/run-claude.ts", "tools/agx/src/next/claude-*.ts", "tools/agx/tests/**", "tools/*/.changes/*.md"]
verify = ["bun test tools/agx/tests/next", "mise run gate:land"]
timeout_s = 2400
premises = ["file:tools/agx/src/next/run.ts", "file:tools/agx/src/workers/run-claude.ts"]

[proposition]
id = "CLAUDE-WORKSPACE-WRITE-PARITY"
claim = "a live probe on a claude row (temp AGX_NEXT_STATE_DIR, a fixture ticket whose verify is `bunx --bun oxlint --version` and which asks the worker to run `bun --version` and write one file) completes with the command run and the file written, and a write outside the workspace is refused"
refuted_by = "the probe's worker reports a command was not approved, or it can write outside its workspace"
+++

Observed 2026-10-15 16:05: run 1f5dda07 (ticket nosync-u02, row sonnet-medium) ended in 55 s with no change; its report
says `bunx --bun oxlint` "was not approved" twice and a file outside the workspace could not be read.
tools/agx/src/next/run.ts:306-308 maps workspace-write → `--permission-mode acceptEdits` (Bash needs approval, which a
headless worker never gets), read-only → plan, none → bypassPermissions. tools/agx/src/workers/run-claude.ts has an
allowedTools option. Now that the roster no longer biases Jev toward codex, claude rows are picked more often, so every
command-dependent ticket on a claude row fails. Choose the mechanism (Claude Code sandbox settings, allowedTools with a
Bash allow rule plus a write boundary, or another) and state why it keeps the write boundary. Probe live on a claude row
with a temp AGX_NEXT_STATE_DIR; never the shared log. Changesets via the `mise run changeset` shape. Do not commit or push.

## Current state (coordinator agt_g67e, 2026-10-15)
Route fact for the router: this ticket needs shell commands (tests, gate, a live probe). Until this ticket lands, a
worker on any claude row at workspace-write cannot run them: run 0a4e6913 (row sonnet-medium) on this same ticket was
refused `bun --version` and returned with no change. A codex row runs commands inside its OS sandbox
(tools/agx/src/workers/codex.ts:439 approval_policy="never" with --sandbox workspace-write).
