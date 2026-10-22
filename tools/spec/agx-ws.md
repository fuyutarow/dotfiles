# agx-ws — `agx ws`

`tools/agx-ws/` is the sole owner of the run-workspace lifecycle: where a workspace lives, how it
is made ready, when it may be removed. Use `agx ws` or the `agx-ws` bin, installed by `bun link`
(`mise run deps`) like `rr` and `agx`. It is repo-agnostic: it knows jj, not dotfiles.

**Proposition (WS-ONE-OWNER-NO-STATE).** `add` creates the declared path and runs the readiness
command; `rm` refuses with an unlanded change; `gc` collects exactly the terminal lineages with no
live pid and no unlanded change and nothing else, and refuses when `RIP_GRAVEYARD` is RAM-backed;
the tool writes no state file; every verb fails before work when its precondition is unmet.
Refuted by a fixture where `gc` collects a live, continuing or unlanded workspace, `rm` loses an
unlanded change, or the tool writes a state file. The fixtures are `tools/agx-ws/tests/`.

**Proposition (WS-STALE-SPARSE).** After a parent rebase, `refresh` updates the named stale
workspace; `add` updates its source and backing workspace when jj reports them stale, and makes
the new workspace current with sparse patterns `.` before readiness. `gc --dry-run` reports
workspaces whose sparse patterns are not exactly `.`. Refuted by a stale workspace after refresh
or add, a newly added workspace with narrowed sparse patterns, or a narrowed fixture omitted
from the gc report. Fixtures use temporary jj repositories outside the checkout.

**Proposition (WS-GC-LOCK-SCOPE).** A GC pass over many slow classifications permits `agx ws add`
to acquire the store lock during classification or immediately after the current workspace's
removal. A changed verdict is re-checked under that lock and retained when no longer collectable.
Dry runs never take the exclusive lock or snapshot workspaces. Waits exceeding five seconds
report elapsed seconds and the holder's command, pid, host and start time. Refuted by add waiting
for an entire pass, or removal without a locked re-check. Fixtures:
`tools/agx-ws/tests/lock-scope.test.ts`.

## Layout and naming

For a repo whose backing store is `<parent>/<repo>`:

| Thing                         | Name                             |
| ----------------------------- | -------------------------------- |
| workspace directory           | `<parent>/<repo>.ws/ws_<slug>`   |
| jj workspace name             | `ws_<slug>` (the directory name) |
| agx-worker worker (elsewhere) | `agt_<slug>`                     |

`--repo P` (default: the cwd) may be the main checkout or any workspace of the store; `agx ws` resolves
the backing store from jj's own metadata without invoking jj. A slug is letters, digits, `_`, `-`.

agx-ws and agx-worker compose by data and by names, never by a shared ledger: agx routes commands to the
parts, agx-worker consumes a tree through `--cd`, and `agx ws gc` reads `agx worker ls --json`.

## Verbs

```text
agx ws add <slug> [--rev R] [--repo P]
agx ws refresh <slug> [--repo P]
agx ws rm  <slug> [--repo P]
agx ws gc  [--dry-run] [--include-unrecorded] [--repo P]
```

- **add** — resolves `--rev` (exactly one commit), updates stale source/backing workspaces with
  `jj workspace update-stale`, runs `jj workspace add --name ws_<slug> [-r R]`, then checks the new
  workspace for staleness and sets `jj sparse set --clear --add .` before trust and each
  readiness command in order inside the new directory, in the foreground with inherited stdio. A
  failing readiness command exits non-zero and the new workspace is removed again (add is all or
  nothing; a failed rollback is reported with the path).
- **refresh** — checks the named registered workspace with `jj status` and runs
  `jj workspace update-stale` only when jj reports `working copy is stale`. Other failures are
  returned without attempting repair. It does not run readiness, trust mise, or change sparse
  patterns. Repeating refresh on a current workspace succeeds. It needs neither repo readiness
  configuration nor a graveyard, and uses the same store lock as the other verbs.
- **rm** — judges the workspace, then `jj workspace forget ws_<slug>` and `rip <dir>`. It refuses if
  any change reachable from the workspace's `@` is not reachable from trunk and is non-empty.
  The working copy is snapshotted first, so an uncommitted edit counts. Land or abandon the change
  first; there is no force flag.
- **gc** — one line per candidate: `collected|would-collect|keep <TAB> dir <TAB> reason`. `--dry-run`
  removes nothing and fails on the same preconditions a real run would. Inventory and initial
  classification use saved jj snapshots without locking, snapshotting or repairing stale
  workspaces. Unsnapshotted edits can change a dry-run verdict; collection always snapshots and
  re-checks the selected workspace under the lock before removal.

## gc: what is collected

Candidates are `<repo>.ws/ws_*` and the legacy siblings `<parent>/<repo>-ws-*` and
`<parent>/<repo>-arm-*` (this covers `~/dotfiles-ws-*`, `~/dotfiles-arm-agx-*`,
`~/Workspace/<repo>-arm-*`) that are jj workspaces of the same store. A candidate is collected
only if all hold:

1. **Lineage is terminal.** The lineage is every `agx worker ls --json` record whose `workspace` or `cwd` lies
   inside the directory, closed over `continues` in both directions. Every record in it must have
   state `ended` or `orphaned`. Any other state, including a later run that continues an ended
   one, keeps the workspace.
2. **No live pid.** On Linux no process may have its cwd inside the directory (`/proc/*/cwd`); other
   platforms rely on agx state alone.
3. **Nothing unlanded.** The workspace's `@` (snapshotted) and every recorded run-end commit
   (`end_commit` on a record) have no non-empty commit outside trunk. A revset that cannot be
   evaluated keeps the workspace. Judging is repeated under the lock immediately before removal.

A candidate with no agx record is **unrecorded**: `gc --dry-run` reports it as `keep … unrecorded`,
and only `--include-unrecorded` collects it, and then only if conditions 2 and 3 hold (no diff).
A directory under `<repo>.ws/` that is not a workspace of this store is reported and left alone.
Before judging collection, gc reads sparse patterns without snapshotting. Any set other than
exactly `.` (including an empty set) is reported as `keep` with its patterns, even for live or
unrecorded workspaces; an unreadable sparse set also keeps the workspace. gc never widens sparse
patterns. Each candidate still produces one report line.

## Repo configuration: `.ws.toml`

A small repo-owned file at the backing store root. Every command, including add, adopt, rm,
gc and doctor, uses the main checkout's working `.ws.toml` when present, whether tracked or
untracked. Otherwise it reads `.ws.toml` from that checkout's `@-` revision. If neither
exists, defaults are no readiness commands, trunk `trunk()` and no keep entries. A config
in a secondary workspace does not override this rule. Read or parse failures are errors,
not a reason to fall back and silently lose keep protection. GC applies the same rule
again under the store lock before removal. To clear committed policy, leave an empty
working `.ws.toml`; deleting the working file selects the committed fallback.

```toml
ready = ["mise trust -q", "bun install --frozen-lockfile"]   # sh -c, in order, in the new workspace
trunk = "alpha"                                              # revset that defines "landed"
keep = ["ws_reference"]                                      # workspace names or paths to preserve
```

Unknown keys are an error. dotfiles declares the example above.

## Invariants

- **No durable state of its own.** Everything is derived from jj, `.ws.toml`, `agx worker ls --json` and
  the filesystem. The lock directory `<parent>/<repo>.ws.lock` is removed on release. Foreground
  waiters advertise transient intent in the adjacent `.ws.lock.waiters/` directory, cleaned on
  completion; dead local waiter entries are discarded by GC.
- **One lock per backing store**, shared by mutating verbs (`tools/shared` dir-lock; a dead holder's
  lock is taken over). GC classifies without it, then acquires it separately for each removal,
  refreshing config, trunk, run records and workspace registration before judging again. GC skips
  busy stores and yields to advertised foreground waiters, so another removal cannot jump ahead
  of a waiting add. Dry runs never acquire it. Other commands wait, reporting holder and elapsed
  time every five seconds, then refuse after fifteen minutes; the holder is never killed.
- **Foreground and loud.** Every failure is a `ws: …` line on stderr and a non-zero exit.
- **Never kills jj.** jj runs without a timeout; read-only probes use `--ignore-working-copy`; Git
  ref locks are named and refused, never removed.
- **Removal is `rip`, never `rm`.** `add`, `rm` and `gc` refuse when the graveyard (`RIP_GRAVEYARD`,
  else `GRAVEYARD`, else `$XDG_DATA_HOME/graveyard`) is on tmpfs/ramfs or its filesystem cannot be read.
- Preconditions (`jj` and `rip` on PATH, valid slug and config, repo resolves, `agx` works for gc,
  graveyard disk-backed, target absent for add / present and registered for rm) are all checked
  before the first mutation.
  Refresh uses only the applicable subset described above.

## Interface with agx-worker

`agx ws gc` needs from each `agx worker ls --json` record: `id`, `state`, `workspace`, `cwd`, `continues`, and
optionally `end_commit` (the commit id of the run's working copy when the run ended). agx-worker does
not record `end_commit` yet; until it does, the live `@` check alone judges landing. The agx-worker
scope row for workspaces should read: "agx-worker consumes a tree via `--cd`; creating, readying and
collecting trees is `agx ws` (`tools/agx-ws`)".
