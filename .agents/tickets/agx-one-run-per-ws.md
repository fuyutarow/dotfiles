+++
schema = 2
name = "agx-one-run-per-ws"
outcome = "`agx run` refuses to start (non-zero exit, message naming the running run id) when another run of this host is still running with the same --cd workspace, including `--continue`; the check is a fold over agx's own records plus pid liveness (no new state); `--force` is not added"
writes = ["tools/agx/src/next/run.ts", "tools/agx/src/next/commands.ts", "tools/agx/src/next/store.ts", "tools/agx/tests/**", "tools/*/.changes/*.md"]
verify = ["bun test tools/agx/tests", "mise run lint:ts", "mise run lint:bun", "mise run typecheck"]
timeout_s = 1800
premises = ["file:tools/agx/src/next/run.ts", "file:tools/agx/docs/scope.md"]

[proposition]
id = "AGX-ONE-RUN-PER-WS"
claim = "fixtures: a second `agx run` on a workspace whose run is alive exits non-zero before spawning a worker and names the live run; after that run ends (or its pid is dead → orphaned) a new run starts"
refuted_by = "two live runs recorded with the same workspace"
+++

Incident 2026-10-16 11:2x: two preset-julia runs (78aa66e8, c07bdae3) ran at once in dotfiles.ws/ws_preset-julia because a
delayed --continue started after a second one was issued; the coordinator stopped one by hand. Architecture: one writer
per state (I1); a workspace has one writer at a time. lint:no-sync is on alpha. You cannot rebase in the sandbox.
Definition of done: `mise run hook:pre-commit` exits 0; paste its last 5 lines. Test data outside the workspace.
Do not commit or push.

## Current state (coordinator decision — single current version)
You correctly found the check-then-append race. Decision: use a kernel advisory lock, not records alone — `agx run`
opens a lock file keyed by the resolved --cd path (under agx's own state dir, e.g. locks/<sha256(path)>) and takes an
exclusive non-blocking flock for the whole life of the run; a second run on the same workspace fails at once naming the
holder (read from the records); the kernel releases the lock when the process dies, so no stale lease or ledger exists
(consistent with scope.md). Put the evidence of `mise run hook:pre-commit` into the `checks` field of your JSON return
(do not paste fenced blocks outside the JSON).

