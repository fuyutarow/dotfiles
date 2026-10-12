# disk-reclaim

Plan configured reclamation as one JSONL record per candidate. `apply` reads those records from
stdin, revalidates each fingerprint and target safety, then acts only on selected safe records.
The CLI registers thirteen reclaim targets. The no-argument invocation renders the same plan
for a person; `--yes` composes planning and application.

```text
disk-reclaim
disk-reclaim plan [--on <host>] [--target <target>...]
disk-reclaim apply [--approve <owner-item>...]
disk-reclaim --yes [--on <host>] [--target <target>...]
disk-reclaim run TARGET... --yes [--json] [--stop-on-error] [--fetch]
disk-reclaim run --tier blind --yes
disk-reclaim targets [--json]
disk-reclaim receipts [--last N] [--json]
disk-reclaim wrap NAME [--interactive] -- CMD...
disk-reclaim delete <abs-path>... [--yes] [--json]
```

`plan` emits newline-delimited records with `target`, `host`, `path`, `bytes_allocated`, `regen`,
`holders`, `verdict`, `reason`, and fingerprint fields. Windows host records use the lever id as
`target`, report allocation from Windows `SizeOnDisk`, and set `fingerprint` to null because the
remote path cannot be fingerprinted locally. `apply` skips records without a local fingerprint.
Pipe locally fingerprinted records directly to `apply`; no plan data is read from disk. `apply`
takes a per-host lock and checks each record again immediately before the target action. Replaced
or changed paths are skipped. Owner-only rows remain ASK until their item is supplied with
`--approve <owner-item>`; XDG Trash uses `--approve xdg-trash`. `--yes` is the single-process
equivalent of `plan | apply`.

Plan is read-only. Legacy `run` requires named targets or `--tier blind`, plus `--yes`. `delete`
prints its checks and byte estimate without `--yes`; with `--yes` it repeats every check under
the shared state lock, then removes only paths beneath configured roots. It refuses `/`, `$HOME`,
repo store roots, listed jj workspaces, symlink paths, and paths used by same-uid processes.
Unreadable same-uid process information fails closed. During removal, each same-uid directory is made
owner-readable, writable, and searchable before its children are visited; the traversal checks
that directory for a jj/git store or a listed jj workspace and refuses that subtree while
continuing with siblings. The no-`--yes` plan reports that nested store checks are deferred to
traversal. A listed jj workspace must first be forgotten with `jj workspace forget`, or handled
through the `workspaces` target.

The blind tier selects clean, builds, rust, toolchains, workspaces, scratch, `rip-expire`, and
system (sudo). Rip expiry removes only entries in `RIP_GRAVEYARD` older than the configured
24-hour retention. It leaves XDG Trash for owner approval. The graveyard location comes from
the `RIP_GRAVEYARD` environment setting exported by the shell setup. Workspaces runs before
scratch; both share one liveness snapshot per plan and recheck facts under the lock. Judgment
and host require owner selection, purge must be named, and vhdx/audit are plan-only.
`targets --json` lists their tiers and availability without scanning candidates.
Within blind-tier targets, a failed candidate does not prevent later candidates from being
attempted; the run still exits 1 if any candidate fails. `--stop-on-error` stops the target at its
first failure. A target planning failure is recorded in that target's `skip_reason`, the target
is skipped, and other targets continue. An unreadable jj store is skipped while other stores
remain eligible. Target failures make `run --yes` exit 1; invocation errors exit 2. Clean selects
only Julia's `compiled` and `scratchspaces` directories; it keeps
both while a same-uid Julia process is live. It keeps Cargo registry and git caches while a
same-uid `cargo`, `rustc`, or `rust-analyzer` process is live.
`--fetch` is opt-in for plan/run: it refreshes jj Git remotes before judging workspaces; failure
leaves them ASK. The pushed-content revset excludes the colocated `@git` pseudo-remote.

Inside an agx worker, `run` and `delete --yes` are refused unless either `HOME` or the
reclaim state directory is under the system tmp directory. Run mutating commands from the owner's
own shell, or set `HOME` to a tmp directory for tests. `plan`, `targets`, and `receipts` remain
available in workers.

Configuration resolves beside the executable, or at `RECLAIM_CONFIG` when set. `reclaim.toml`
owns repository, scratch, and delete roots; delete roots default to `/tmp` and `~/.cache`.
Its regenerable workspace entries include `.rumdl_cache`, `.ruff_cache`, `.pytest_cache`,
`.mypy_cache`, and `node_modules/.cache`. Other untracked content still requires review.
`~` and `{uid}` expand to absolute paths. If omitted, `ignore_unreadable_procs` defaults to
`["sshd"]`, matching the shipped configuration. The setting exempts only
EACCES on same-uid cwd/fd/environ/maps probes whose readable comm or exe basename exactly matches
the list, for scratch/workspaces. Other unreadable process-path probes stay ASK; readable live
paths still block reclamation. An unreadable environment scan for a non-ignored process keeps
scratch session liveness unknown without making separately resolved process paths unknown.
Owner-approved delete keeps its stricter unreadable-process refusal.

Each plan uses one `/proc` process snapshot, shared by its liveness and workspace checks. Only
processes whose uid equals the owner's uid affect in-use judgments; foreign-uid processes, including
root, are skipped. Rationale: all agents and workers run as the owner's uid; foreign-uid daemons do
not use user scratch or workspaces (owner decision 2026-10-08). Executable, cwd, fd, and mapped-file
paths are checked independently from environment session ids. Processes that vanish between
listing and reading (`ENOENT` or `ESRCH`) count as gone; unreadable live, non-ignored same-uid
path evidence remains unknown and yields ASK. A workspace with a positive in-use signal is
KEEP, and that check runs before `jj status` can snapshot the working copy. A known conflict also
requires KEEP even when an unrelated fact is unknown.

State precedence is `RECLAIM_STATE_DIR`, then `$XDG_STATE_HOME/reclaim`, then
`~/.local/state/reclaim`. `RECLAIM_LOCK_WAIT_S` controls lock wait time (default 900). The
existing `reclaim` state directory and env names are retained for receipt compatibility. Reads
accept legacy schema-less receipts; delete appends a schema 2 receipt with planned/freed bytes.

Storage thresholds are exposed by the separate read-only `storage-headroom` CLI.

Verify: `bun test tools/disk-reclaim`.

Terminal progress uses reusable Clack taskLog groups in `tools/shared`. Concurrent scans
each have a row; host actions name the host and lever; deletion combines path counters into
its owning target row. Finished rows collapse to one-line results. Human progress is on stderr
through the shared Clack adapter on a TTY; off-TTY progress is silent, leaving JSONL stdout
unchanged. Cursor visibility and terminal input modes are untouched.

Unreadable live-process probes produce one stderr summary per cause and identify targets
held back as ASK. Expected EACCES from exactly named systemd, sudo, su, and polkitd
processes is excluded from in-use uncertainty after identity revalidation;
readable positive use still blocks reclamation. Other unreadable processes remain
unknown. Workspace rows show allocated bytes for every verdict, or unknown bytes
if sizing fails. Use `--verbose` on plan/run for per-probe details;
the JSON plan retains its original facts.

`plan --on windows` uses noninteractive SSH with a 10-second connect timeout and a
90-second total probe timeout. Script transfer uses a base64 line so Windows SSH stdin EOF
does not hold up PowerShell. Stderr names the current transfer, measurement, allocation scan,
or WSL query step. Timeout exits 2 with the last step and captured output; it emits no partial
JSONL plan. The installed bin reads its linked checkout, so workspace changes take effect only
when that checkout is updated. Unknown unreadable processes remain ASK with PID, comm, and exe
in the plan reason; an unavailable identity is named explicitly.
