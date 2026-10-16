# jj-ws — `ws`

`tools/jj-ws/` is the sole owner of the run-workspace lifecycle: where a workspace lives, how it
is made ready, when it may be removed. Package `bin` `ws`, installed by `bun link` (`mise run deps`)
like `rr` and `agx`. It is repo-agnostic: it knows jj, not dotfiles.

**Proposition (WS-ONE-OWNER-NO-STATE).** `add` creates the declared path and runs the readiness
command; `rm` refuses with an unlanded change; `gc` collects exactly the terminal lineages with no
live pid and no unlanded change and nothing else, and refuses when `RIP_GRAVEYARD` is RAM-backed;
the tool writes no state file; every verb fails before work when its precondition is unmet.
Refuted by a fixture where `gc` collects a live, continuing or unlanded workspace, `rm` loses an
unlanded change, or the tool writes a state file. The fixtures are `tools/jj-ws/tests/`.

## Layout and naming

For a repo whose backing store is `<parent>/<repo>`:

| Thing | Name |
| --- | --- |
| workspace directory | `<parent>/<repo>.ws/ws_<slug>` |
| jj workspace name | `ws_<slug>` (the directory name) |
| agx worker (elsewhere) | `agt_<slug>` |

`--repo P` (default: the cwd) may be the main checkout or any workspace of the store; `ws` resolves
the backing store from jj's own metadata without invoking jj. A slug is letters, digits, `_`, `-`.

ws and agx compose by data and by names, never by a shared ledger: agx consumes a tree through
`--cd`, and `ws gc` reads `agx ls --json`.

## Verbs

```text
ws add <slug> [--rev R] [--repo P]
ws rm  <slug> [--repo P]
ws gc  [--dry-run] [--include-unrecorded] [--repo P]
```

- **add** — resolves `--rev` (exactly one commit), runs `jj workspace add --name ws_<slug> [-r R]`, then each
  readiness command in order inside the new directory, in the foreground with inherited stdio. A
  failing readiness command exits non-zero and the new workspace is removed again (add is all or
  nothing; a failed rollback is reported with the path).
- **rm** — judges the workspace, then `jj workspace forget ws_<slug>` and `rip <dir>`. It refuses if
  any change reachable from the workspace's `@` is not reachable from trunk and is non-empty.
  The working copy is snapshotted first, so an uncommitted edit counts. Land or abandon the change
  first; there is no force flag.
- **gc** — one line per candidate: `collected|would-collect|keep <TAB> dir <TAB> reason`. `--dry-run`
  removes nothing and fails on the same preconditions a real run would.

## gc: what is collected

Candidates are `<repo>.ws/ws_*` and the legacy siblings `<parent>/<repo>-ws-*` and
`<parent>/<repo>-arm-*` (this covers `~/dotfiles-ws-*`, `~/dotfiles-arm-agx-*`,
`~/Workspace/<repo>-arm-*`) that are jj workspaces of the same store. A candidate is collected
only if all hold:

1. **Lineage is terminal.** The lineage is every `agx ls --json` record whose `workspace` or `cwd` lies
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

## Repo configuration: `.ws.toml`

A small repo-owned file at the backing store root. Absent = no readiness commands, trunk `trunk()`.

```toml
ready = ["mise trust -q", "bun install --frozen-lockfile"]   # sh -c, in order, in the new workspace
trunk = "alpha"                                              # revset that defines "landed"
```

Unknown keys are an error. dotfiles declares the example above.

## Invariants

- **No state of its own.** Everything is derived from jj, `.ws.toml`, `agx ls --json` and the
  filesystem. The only transient file is the lock directory `<parent>/<repo>.ws.lock`, removed on
  release.
- **One lock per backing store**, shared by all verbs (`tools/shared` dir-lock; a dead holder's lock
  is taken over). A busy lock is waited for with a message, then refused; the holder is never killed.
- **Foreground and loud.** Every failure is a `ws: …` line on stderr and a non-zero exit.
- **Never kills jj.** jj runs without a timeout; read-only probes use `--ignore-working-copy`; Git
  ref locks are named and refused, never removed.
- **Removal is `rip`, never `rm`.** `add`, `rm` and `gc` refuse when the graveyard (`RIP_GRAVEYARD`,
  else `GRAVEYARD`, else `$XDG_DATA_HOME/graveyard`) is on tmpfs/ramfs or its filesystem cannot be read.
- Preconditions (`jj` and `rip` on PATH, valid slug and config, repo resolves, `agx` works for gc,
  graveyard disk-backed, target absent for add / present and registered for rm) are all checked
  before the first mutation.

## Interface with agx

`ws gc` needs from each `agx ls --json` record: `id`, `state`, `workspace`, `cwd`, `continues`, and
optionally `end_commit` (the commit id of the run's working copy when the run ended). agx does not
record `end_commit` yet; until it does, the live `@` check alone judges landing. The agx scope row for
workspaces should read: "agx consumes a tree via `--cd`; creating, readying and collecting trees is
`ws` (`tools/jj-ws`)".
