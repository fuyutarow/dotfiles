+++
schema = 2
name = "jjsafe"
outcome = "no harness code path can leave a partial .git/packed-refs.lock: agx creates and removes dispatch workspaces itself (jj workspace add/forget under a per-backing-.git flock, loud failure, no empty directory), durable units are launched with KillMode=mixed, and every harness call that runs jj under a kill-on-timeout deadline either uses a non-mutating invocation or is not killed mid-command"
writes = ["tools/agx/**", "agents/hooks/**", "agents/claude/hooks/**", "tools/repo-retrieve/**", "tools/shared/**", "tools/*/.changes/*.md"]
verify = ["bun test tools/agx", "bun test agents/hooks", "bun test tools/repo-retrieve", "mise run gate:land"]
timeout_s = 3000
premises = ["file:tools/agx/contract.md", "file:tools/agx/docs/scope.md"]

[proposition]
id = "JJ-NO-PARTIAL-LOCK"
claim = "concurrent dispatches into sibling workspaces of one repo serialize their ref updates; stopping a durable unit lets an in-flight jj finish or abort cleanly; no harness jj call is SIGKILLed or deadline-killed while it can write refs"
refuted_by = "a test where two concurrent agx workspace creations race on one .git, a stopped unit leaves a lock, or a harness call kills a ref-writing jj on timeout"
+++

Facts (2026-10-15):
- firedancer saw five ownerless .git/packed-refs.lock files (08:49, 10:36, 11:07, 12:50, 13:02 JST). #4 and #5 were
  partial (117 KB and 994 KB vs 1.36 MB packed-refs); #4 followed `systemctl --user stop` of two agx units; #3
  followed two concurrent `jj git fetch` in sibling workspaces; #5 had no stop.
- Landed already (gitlock): agx refuses dispatch into a repo with an ownerless ref lock and names it; doctor reports
  it; agx gives its own children SIGTERM then 30 s before SIGKILL.
- The previous worker established that agx itself does not call `jj workspace add`, fetch or commit: workspaces are
  created by the dispatcher by hand (`jj workspace add --name N -r alpha ../repo-ws-N`) and by firedancer's own
  launch helper. The durable launch form is documented at tools/agx/contract.md:35 and tools/agx/docs/scope.md:23
  (and CLAUDE.md, which you must not edit: list the lines).
- In a colocated repo any jj command (log, st, status, not only fetch/commit) may import/export git refs, so a jj
  killed by a caller's deadline can leave a partial lock.
Do:
1. agx owns workspace lifecycle (charter: the dispatch mechanism creates and cleans workspaces): `agx run --new-workspace
   <name> [--from <rev>]` (or an `agx workspace add|rm` pair; pick one, justify) runs `jj workspace add` under a flock
   keyed by the backing .git, verifies `.jj/working_copy/type` exists, and fails non-zero with the jj stderr otherwise;
   it also runs `mise trust` and the repo's install step if declared. Removal mirrors it.
2. Durable launch: wherever agx documents or emits the systemd-run form, add `-p KillMode=mixed -p TimeoutStopSec=60`;
   agx on SIGTERM forwards SIGTERM to its worker tree and waits up to the grace before exiting.
3. Inventory every harness call site that runs jj with a timeout/kill (agents/hooks, agents/claude/hooks,
   tools/repo-retrieve, tools/agx, tools/statusline). Fix the ones in your writes: prefer read-only invocations that
   skip snapshot and ref export (verify which jj flags/config achieve that on the installed jj version, e.g.
   --ignore-working-copy, and whether git import/export still runs), or remove the kill. For tools/statusline (not in
   writes; ticket statusflap is open there) list the sites and the exact change.
4. Tests: flock serializes two concurrent creations; a fake jj mid-write survives a unit stop under KillMode=mixed;
   no inventoried call kills a ref-writing jj.
Report proven vs inferred. Do not touch firedancer. Probe agx against a temp AGX_NEXT_STATE_DIR. Do not commit or push.
