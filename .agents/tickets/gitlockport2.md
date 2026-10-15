+++
schema = 2
name = "gitlockport2"
outcome = "the writer that leaves an ownerless .git/packed-refs.lock in a colocated jj repo is identified with evidence; the harness no longer kills a jj/git ref transaction mid-write (or, if that cannot be guaranteed, agx refuses to dispatch into a repo with an ownerless packed-refs.lock and names it); doctor reports an ownerless lock in registered repos"
writes = ["tools/agx/**", "tools/agent-resource-run/**", "tools/shared/**", "scripts/doctor*.ts", "scripts/doctor/**", "tools/*/.changes/*.md", "README.md"]
verify = ["mise run gate:land"]
timeout_s = 2400
premises = ["file:tools/agent-resource-run/resource-policy.toml", "file:tools/agx/package.json"]

[proposition]
id = "GITLOCK-NO-ORPHAN"
claim = "ending an agent-resource scope or an agx run while a jj ref update is in flight never leaves an ownerless packed-refs.lock; and an ownerless lock that exists anyway is detected and named before dispatch and by doctor"
refuted_by = "a test that ends a scope or run during a ref update leaves the lock, or a fixture repo with an ownerless packed-refs.lock passes agx dispatch preflight or doctor silently"
+++

Reported by firedancer (2026-10-15). In /home/fuyu/Workspace/firedancer (colocated jj + git), a stale
`.git/packed-refs.lock` appears repeatedly. Until it is removed, every jj ref update by every worker fails with
"lock for resource .git/packed-refs could not be obtained after 1.00s after 15 attempts". Several agx units started
with empty workspaces ("Cannot access .../.jj/working_copy/type") because `jj workspace add` failed.

Occurrences (JST):
1. lock mtime 08:49:25, equal to packed-refs' own mtime 08:49:25; no holder (fuser empty).
2. lock mtime 10:36:18, equal to packed-refs' mtime 10:36:18; no holder.

Unverified lead: at 10:36:17 the user journal shows
"agent-resource-1910375-c45d4e9d-5d74-46e9-a68e-d071edb5472b.scope: Consumed 23min 59s CPU over 27min 6s".
The equal mtimes suggest one writer renamed lock -> packed-refs while a second writer had just created a new lock and
was killed before completing, e.g. a jj/git process inside a resource scope or an agx unit killed when it ended.

Do:
1. Find the writer, with evidence. Read `journalctl --user` around both times (scopes and agx-* units ending, their
   kill mode / signal), and how agent-resource-run and agx end their children (KillMode, SIGKILL vs SIGTERM grace,
   process-group kill on timeout). Determine which jj operations in the harness touch packed-refs (workspace add,
   commit/export, fetch) and from which process. Report what is proven and what is inference.
2. Prevent: whatever ends a run or scope must give a jj/git child a bounded SIGTERM grace and must not SIGKILL a ref
   transaction mid-write; or the harness must not run jj ref updates inside killable scopes. Choose the smallest
   structural fix and justify it.
3. Detect: a lock is ownerless when no process holds it open (no fuser/`/proc/*/fd` holder) and its mtime is older
   than a bound (for example 60 s). agx run's dispatch preflight refuses into a repo with an ownerless
   `.git/packed-refs.lock` (or `.git/*.lock` among ref locks) and prints its path, age and the repair
   (`rip <path>` after confirming no holder). doctor reports the same for repos it knows. Do NOT auto-delete.
4. Tests with a fixture repo for detection (holder present -> not ownerless; old and no holder -> ownerless) and for
   the termination grace.
Probe unlanded agx against a temp AGX_NEXT_STATE_DIR. Do not touch firedancer's checkout (read its journal and lock
state only). Do not restart services or deploy. Do not commit or push.

## Evidence (firedancer, 2026-10-15; four occurrences)
1-2. 08:49:25 and 10:36:18 JST: lock mtime equal to packed-refs mtime, full size, no holder.
3. 11:07:34: same shape; two `jj git fetch` started at 11:07:05 in sibling workspaces of one repo; no scope ended.
4. 12:50:57: lock 117,242 B vs packed-refs 1,365,007 B (mtime 12:37:15), no holder: a rewrite stopped partway.
   12:49:14: two firedancer agx units were stopped with `systemctl --user stop`; ~12:50:5x a new unit started whose
   brief begins `jj git fetch`.

5. 13:02:14: lock 993,691 B (partial) one second after packed-refs was rewritten (13:02:13, 1,364,608 B); no holder;
   NO `systemctl stop`. Alive: two codex agx units; ccc-daemon was being restarted (13:02:23).
Candidates not covered by KillMode=mixed, to test: (a) in a colocated repo, ANY jj command (log, st, status — not only
fetch/commit) imports/exports git refs and can rewrite packed-refs; a caller that kills jj on a deadline
(execAsyncBounded-style 2000 ms bounds in tools/statusline, hooks, repo-retrieve, agx) leaves the lock mid-write;
(b) a codex exec_command timeout killing a jj child. Inventory every place the harness runs jj with a kill-on-timeout
and either run it with --ignore-working-copy/--no-snapshot-style flags that skip ref export, or never kill it.

## Current state (coordinator agt_g67e, 2026-10-15 15:25)
Run 5389190b stopped because it did not find the `changeset` mise task. It exists on alpha (mise.toml:451,
`mise run changeset -- <tool> <bump> "<entry>"`, from csschema 56acccec); if your workspace predates it, write the
changeset by hand exactly as: ---, bump: patch, ---, blank line, one entry line. Continue the port (doctor integration,
tests, gate). The original lock writer is unidentified; correlation only is fine.
