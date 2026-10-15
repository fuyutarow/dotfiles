+++
schema = 2
name = "run-commit2"
outcome = "when a run ends, agx (outside the worker sandbox) snapshots the run's workspace so the worker's file changes become the workspace's working-copy commit, and records that commit id and its diff stat (files, insertions, deletions vs the fork point) on the ended event; `agx ls --json` exposes them; a workspace whose worker wrote files never looks empty to jj or to a cleanup check"
writes = ["tools/agx/src/next/run.ts", "tools/agx/src/next/snapshot.ts", "tools/agx/src/next/ls.ts", "tools/agx/tests/next/**", "tools/*/.changes/*.md"]
verify = ["bun test tools/agx", "mise run gate:land"]
timeout_s = 2400
premises = ["file:tools/agx/src/next/run.ts"]

[proposition]
id = "RUN-END-SNAPSHOT"
claim = "after a fixture worker writes files without running jj, the ended event carries a commit id whose diff contains those files, and `jj log` from another workspace sees that commit without anyone running jj st in the run's workspace"
refuted_by = "a fixture where the ended event lacks the commit id or diff stat, or another workspace sees an empty commit for a run that wrote files"
+++

Reported by coralbase-agt_6n0x and seen in dotfiles all day: workers write files, but the sandbox cannot write the shared
.jj store, so the change stays unsnapshotted until someone runs `jj st` in that workspace. Effects: `jj new <ws>@` merged
an empty commit; a cleanup judged 9 accepted-but-unlanded workspaces "empty"; worker reports said "jj diff shows 0 files".
Do: after the worker process exits (success or not), agx runs one snapshot of the workspace outside the sandbox
(e.g. `jj --repository <ws> status` or `jj util snapshot` if available on the installed jj; never kill it: no deadline
kill on jj, per ticket jjsafe4), then records `commit_id` (the workspace's @) and `diff_stat` vs the fork point on the
ended event. Expose both in `agx ls --json` and add them to the plain `agx ls` row. Tests with a fixture repo and a fake
worker. Ticket runslug edits store.ts and dispatch rows in parallel: add your fields to the event schema with minimal
edits in store.ts only if unavoidable, and list them. Probe against a temp AGX_NEXT_STATE_DIR. Do not commit or push.

## Current state (coordinator agt_g67e, 2026-10-15) — port onto current alpha
Run 201e5353 is accepted (snapshot at run end; commit_id and diff_stat on the ended event; both verify passed except one
tools/agx test that also fails on alpha 261f241e: "real TypeScript checking sees workspace types through a stale consumer
link"). Landing failed: rebase conflict in tools/agx/src/next/run.ts with changes landed since (gitlockport2 1262f7e8:
SIGTERM then 30 s before SIGKILL; hookws d9eddfc5). The accepted change lives in /home/fuyu/dotfiles-ws-runcommit (read
it, do not write it). This fresh workspace starts at current alpha: re-apply the change by meaning, keep both, re-run
verify. Ticket claude-worker-shell edits run.ts lines ~300-330 in parallel; keep your edit away from that block.
No jj rebase. Do not commit or push.
