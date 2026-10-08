# disk-reclaim

Preview configured reclamation and run only candidates whose checks prove they are safe. The
CLI registers all twelve reclaim targets. `delete` is a separate owner-approved
path for candidates a human has reviewed.

```text
disk-reclaim [plan] [TARGET...] [--tier T] [--json] [--all] [--fetch]
disk-reclaim run TARGET... --yes [--json] [--stop-on-error] [--fetch]
disk-reclaim run --tier blind --yes
disk-reclaim targets [--json]
disk-reclaim receipts [--last N] [--json]
disk-reclaim wrap NAME [--interactive] -- CMD...
disk-reclaim delete <abs-path>... [--yes] [--json]
```

Plan is read-only. `run` requires named targets or `--tier blind`, plus `--yes`. `delete`
prints its checks and byte estimate without `--yes`; with `--yes` it repeats every check under
the shared state lock, then removes only paths beneath configured roots. It refuses `/`, `$HOME`,
repo store roots, listed jj workspaces, symlink paths, and paths used by same-uid processes.
Unreadable same-uid process information fails closed. During removal, each same-uid directory is made
owner-readable, writable, and searchable before its children are visited; the traversal checks
that directory for a jj/git store or a listed jj workspace and refuses that subtree while
continuing with siblings. The no-`--yes` plan reports that nested store checks are deferred to
traversal. A listed jj workspace must first be forgotten with `jj workspace forget`, or handled
through the `workspaces` target.

The blind tier selects clean, builds, rust, toolchains, workspaces, scratch, and system (sudo).
Workspaces runs before scratch; both share one liveness snapshot per plan and recheck facts
under the lock. Judgment and host require owner selection, purge must be named, and vhdx/audit
are plan-only. `targets --json` lists their tiers and availability without scanning candidates.
Within blind-tier targets, a failed candidate does not prevent later candidates from being
attempted; the run still exits 1 if any candidate fails. `--stop-on-error` stops the target at its
first failure. Clean selects only Julia's `compiled` and `scratchspaces` directories; it keeps
both while a same-uid Julia process is live. It keeps Cargo registry and git caches while a
same-uid `cargo`, `rustc`, or `rust-analyzer` process is live.
`--fetch` is opt-in for plan/run: it refreshes jj Git remotes before judging workspaces; failure
leaves them ASK. The pushed-content revset excludes the colocated `@git` pseudo-remote.

Inside an agent-dispatch worker, `run` and `delete --yes` are refused unless either `HOME` or the
reclaim state directory is under the system tmp directory. Run mutating commands from the owner's
own shell, or set `HOME` to a tmp directory for tests. `plan`, `targets`, and `receipts` remain
available in workers.

Configuration resolves beside the executable, or at `RECLAIM_CONFIG` when set. `reclaim.toml`
owns repository, scratch, and delete roots; delete roots default to `/tmp` and `~/.cache`.
`~` and `{uid}` expand to absolute paths. If omitted, `ignore_unreadable_procs` defaults to
`["sshd"]`, matching the shipped configuration. The setting exempts only
EACCES on same-uid cwd/fd/environ probes whose readable comm or exe basename exactly matches
the list, for scratch/workspaces. Other unreadable processes stay ASK; readable live paths
still block reclamation. Owner-approved delete keeps its stricter unreadable-process refusal.

Each plan uses one `/proc` process snapshot, shared by its liveness and workspace checks. Only
processes whose uid equals the owner's uid affect in-use judgments; foreign-uid processes, including
root, are skipped. Rationale: all agents and workers run as the owner's uid; foreign-uid daemons do
not use user scratch or workspaces (owner decision 2026-10-08). Processes that vanish between
listing and reading (`ENOENT` or `ESRCH`) count as gone; EACCES on a live, non-ignored same-uid
process remains unknown and yields ASK. A workspace with a positive in-use signal is
KEEP, and that check runs before `jj status` can snapshot the working copy. A known conflict also
requires KEEP even when an unrelated fact is unknown.

State precedence is `RECLAIM_STATE_DIR`, then `$XDG_STATE_HOME/reclaim`, then
`~/.local/state/reclaim`. `RECLAIM_LOCK_WAIT_S` controls lock wait time (default 900). The
existing `reclaim` state directory and env names are retained for receipt compatibility. Reads
accept legacy schema-less receipts; delete appends a schema 2 receipt with planned/freed bytes.

Storage thresholds are exposed by the separate read-only `storage-headroom` CLI.

Verify: `bun test tools/disk-reclaim`.
