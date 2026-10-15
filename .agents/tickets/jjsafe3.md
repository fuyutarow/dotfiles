+++
schema = 2
name = "jjsafe3"
outcome = "no process that can be killed by a worker stop or a deadline ever runs a jj/git command that writes refs in a shared store: ref-writing operations (workspace add, fetch, commit/export) happen only in agx or land, outside worker units and outside kill-on-timeout wrappers; agx creates the dispatch workspace itself (flock per backing store, loud failure); harness calls that must read repo state use read-only invocations that do not export refs; an ownerless ref lock is still detected and named"
writes = ["tools/agx/**", "agents/hooks/**", "agents/claude/hooks/**", "tools/repo-retrieve/**", "tools/shared/**", "tools/*/.changes/*.md"]
verify = ["bun test tools/agx", "bun test agents/hooks", "bun test tools/repo-retrieve", "mise run gate:land"]
timeout_s = 3000
premises = ["file:tools/agx/src/workers/codex.ts"]

[proposition]
id = "NO-KILLABLE-REF-WRITER"
claim = "every jj/git invocation in tools/agx, agents/hooks, agents/claude/hooks, tools/repo-retrieve is either outside any killable unit/deadline or provably does not write refs; agx-created workspaces exist only if `jj workspace add` succeeded"
refuted_by = "an inventoried call site runs a ref-writing jj under a timeout kill or inside a worker unit, or a fixture shows a dispatch proceeding with an empty workspace"
+++

History: firedancer saw five ownerless .git/packed-refs.lock files on 2026-10-15; two were partial (a rewrite killed
mid-write). Run 62de202e (jjsafe2) correctly returned: KillMode=mixed + TimeoutStopSec only delays the kill; systemd
still SIGKILLs after the timeout, so a ref-writing jj inside a stoppable unit can always be cut. It also found
tools/agx/src/workers/codex.ts:503 still uses SIGKILL. (The ownerless-lock refusal and doctor check exist in the
gitlockport workspace and are landing separately; do not re-implement them.)
Design decision (coordinator): remove the possibility instead of narrowing the window.
1. Workers do not run ref-writing jj: agx creates the workspace before the worker starts (flock keyed by the backing
   store; resolve it from `jj root`/the repo store so sibling workspaces share the lock; verify .jj/working_copy/type;
   fail loudly with jj's stderr), and the worker prompt states that fetch/commit/push are not the worker's job (land
   does them). If a worker still needs fresh refs, agx fetches before start, under the same flock.
2. Inventory every jj/git call in the writes above that runs under a deadline or kill (execAsyncBounded-style bounds,
   timeouts). For each: switch to an invocation that does not snapshot or export refs (verify on the installed jj
   version which flags/config achieve that, e.g. --ignore-working-copy and whether git import/export still runs), or
   remove the kill. Report the table (site, command, before, after, evidence).
3. Replace the SIGKILL at codex.ts:503 with SIGTERM + bounded wait + SIGKILL only for non-jj children if possible;
   state what remains.
4. Tests: concurrent agx workspace creations on sibling workspaces serialize; a failed `jj workspace add` aborts the
   dispatch; every inventoried read call uses the non-exporting form.
Probe agx against a temp AGX_NEXT_STATE_DIR. Do not touch firedancer. Do not commit or push.
