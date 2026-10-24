# disk-reclaim

Part of the [tools/ architecture](../spec/architecture.md) (the mechanism the capacity recover part composes: invariants I-R1 to I-R5).

Plan configured reclamation as one JSONL record per candidate. `apply` reads those records from
stdin, revalidates each fingerprint and target safety, then acts only on selected safe records.
The CLI registers fourteen reclaim targets. The no-argument invocation renders the same plan
for a person; `--yes` composes planning and application.

```text
disk-reclaim
disk-reclaim plan [--on <host>] [--target <target>...]
disk-reclaim apply [--approve <owner-item>...]
disk-reclaim --yes [--on <host>] [--target <target>...]
disk-reclaim run TARGET... --yes [--json] [--stop-on-error] [--fetch]
disk-reclaim run --tier blind --yes
disk-reclaim run rip-expire --only /absolute/graveyard/subtree --yes
disk-reclaim run tmpfs --only /absolute/tmpfs/subtree --yes
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

Plan reads candidate data without deleting it and maintains a measurement cache under
`$XDG_CACHE_HOME/disk-reclaim/scan-cache` (default: `~/.cache/disk-reclaim/scan-cache`); tests and
callers can provide a private cache root. The cache evicts the oldest entries above 2,048 JSON
records. Each root's change key
contains device/inode, size, mtime/ctime, and sorted top-level entry metadata. An unchanged key
reuses previous sizing and discovery results; changed roots are scanned again. Completed
subdirectories are cached as well, so an interrupted large-root scan can reuse those measurements
on its next attempt rather than starting every branch again. These are shallow
estimates: a modification deeper than the top level can leave the key unchanged. Remove the
cache directory to request a full measurement. Process and session safety are refreshed for
every plan, and action revalidation bypasses the cache. Workspace facts also include jj tree-state,
operation-head and workspace-index metadata in their keys. Their classification cache also
includes the normalized `regenerable_ignored` policy, so changing allowed tool caches reclassifies
unchanged workspaces.

Progress reports scan starts, cache hits and elapsed time on stderr. A tree worker stops after
ten seconds without advancing entry counters; heartbeats alone do not count as progress.
Progressing plans have no total elapsed-time limit. Only a lack of advancing scan counters or
metadata probes stops a tree worker; user cancellation remains available. Pipe output includes
periodic progress lines on stderr. A cold scan can take as long as needed to complete every target.
An unreachable Windows host is skipped after one probe bounded to five seconds (three seconds
for SSH connection establishment). `--no-progress` suppresses progress lines.

Legacy `run` requires named targets or `--tier blind`, plus `--yes`. `delete`
prints its checks and byte estimate without `--yes`; with `--yes` it repeats every check under
the shared state lock, then removes only paths beneath configured roots. Strict descendants of
the rip graveyard are also eligible delete paths, using `RIP_GRAVEYARD`, then `GRAVEYARD`, then
`$XDG_DATA_HOME/graveyard` (default `~/.local/share/graveyard`). Within that already-deleted data,
repo-store and listed-workspace refusals do not apply. Ownership, live-process, protected-root,
symlink, immutable-attribute and filesystem-boundary checks remain in force. Recorded burial must
also be outside the configured undo window; unknown burial times are held. Outside it, delete refuses `/`, `$HOME`,
repo store roots, listed jj workspaces, symlink paths, and paths used by same-uid processes.
Unreadable same-uid process information fails closed. During removal, each same-uid directory is made
owner-readable, writable, and searchable before its children are visited; the traversal checks
that directory for a jj/git store or a listed jj workspace and refuses that subtree while
continuing with siblings. The no-`--yes` plan reports that nested store checks are deferred to
traversal. A listed jj workspace must first be forgotten with `jj workspace forget`, or handled
through the `workspaces` target.

The blind tier selects tmpfs, clean, builds, rust, toolchains, workspaces, scratch, `rip-expire`,
and system (sudo). Rip expiry removes entries in `RIP_GRAVEYARD` older than the configured
24-hour retention, or eligible entries in recorded oldest-first order to approach the soft
10 GiB capacity target. Every rip reclaim path protects `graveyard_pressure_undo_minutes`
(10 minutes), including age expiry when retention is configured shorter than that window.
Missing, unreadable, or invalid burial records cause entries to be held and reported as unknown;
source mtime never substitutes for recorded burial. If held entries prevent reaching the capacity
target, plans and expiry summaries report the remaining byte shortfall and held payload counts
and bytes. Incomplete size measurements are explicitly lower bounds. `.record` remains retained
by rip expiry. It leaves XDG Trash for owner approval. The graveyard location comes from
the `RIP_GRAVEYARD` environment setting exported by the shell setup. Workspaces runs before
scratch; both share one liveness snapshot per plan and recheck facts under the lock. Judgment
and host require owner selection, purge must be named, and vhdx/audit are plan-only.
`targets --json` lists their tiers and availability without scanning candidates.

The `tmpfs` target reports inode and byte use for each detected tmpfs mount, then considers every
top-level directory owned by the current user. The mkdtemp-style name remains a recognition signal,
but fixed-name directories also qualify when their tree's newest mtime is over 60 minutes old, the
bounded safety walk completes, and no process has the directory or a descendant open. One walk
checks ownership, newest mtime and allocated bytes, with limits of 4 seconds, 1,048,576 entries
and 64 levels. Fresh and open directories skip the walk; reaching a limit produces an ASK row.
Claude/herdr
session directories, systemd-private directories, scratchpads, configured protected paths, other users' files, unreadable or
oversized trees, and open or indeterminate paths are kept or asked. Removal calls direct
recursive unlink/rmdir operations; it does not use `rip`, which would copy deleted entries and
their inode use into a graveyard. Legacy `graveyard-*` directories and configured rip graveyards
on tmpfs/ramfs are held by the tmpfs target and referred to `rip-expire`, which checks recorded
burial and the undo window. Plans report bytes and inode entry counts (including the root directory).
The action summary reports tmpfs inode and byte use before and
after.
Mount counters are read once per planning stage and once at completion, regardless of candidate
count. Candidate rechecks share the stage's liveness snapshot. `tmpfs` and `purge` act on smaller
allocated-byte estimates first; ties preserve discovery order. `rip-expire` acts oldest-first. `--only` limits
these targets to an absolute subtree, retaining symlink and protected-ancestor refusals. Their
summaries count files and directories actually removed and allocated bytes unlinked; mount free
space is a separate observation that can be affected by concurrent writers. Cross-target path
ownership is checked by path components, avoiding pairwise scans of unrelated candidates.
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

The normal suite keeps fixtures small. Run the opt-in scale checks with
`RECLAIM_SCALE=1 bun test tools/disk-reclaim/tests/reclaim-at-scale.test.ts`.
They reclaim 100,000 tmpfs candidate directories in two batches and 1,000,000 graveyard files in
twenty batches. The tmpfs filesystem counters are injected while deletion runs on disk. Each
batch holds at most 50,000 payload entries, with room for roots and engine state below the
100,000-entry ceiling. Fixtures use fresh `mkdtemp` directories only under
`${XDG_CACHE_HOME:-$HOME/.cache}/reclaim-fix-scale/`, outside the checkout; shared RAM-backed paths
and filesystems are refused, with no fallback directory. Each batch is removed in `finally`.
The wall-clock bounds, including setup and cleanup, are 240 seconds for tmpfs and 300 seconds
for the graveyard workload. Measurements are reported alongside these predeclared bounds.

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

`mise run disk:free -- SIZE` (or `disk-reclaim free SIZE`) unlinks eligible rip graveyard
payloads immediately, ignoring the retention age R and capacity target C while preserving U.
SIZE requires a positive finite number and KiB/MiB/GiB/TiB or KB/MB/GB/TB; fractional bytes
round up, and values yielding nonfinite byte counts are invalid. No force or pressure flags
are accepted. Scope uses exactly rip-expire's resolved `RIP_GRAVEYARD` or XDG data graveyard;
stdout and stderr identify the root and filesystem. XDG Trash, caches, workspaces and Windows
host reclamation are outside this command.

A completed request-time discovery fixes the candidate set before waiting for the shared reclaim
lock (at most 10 seconds, regardless of `RECLAIM_LOCK_WAIT_S`). Recorded burial orders eligible
payloads oldest first, with path ids breaking ties. Unknown burial and entries younger than U
are held. Foreign owners and protected paths are skipped; later eligible payloads are still
attempted. Process evidence uses rip-expire's shared graveyard removal rule: already-deleted
payloads can be unlinked even with open files or unreadable process paths. Identity and burial
are checked again under the lock.
Payloads are indivisible selection units: removal preflights the whole payload and does not stop
inside it just because SIZE was reached. Cancellation or a filesystem failure can still interrupt
unlinking; only completed unlinks count. New candidates are never discovered during deletion.

One `reclaim.free/1` JSON document reports `outcome` (`met`, `partial`, `busy`, `invalid`, `failed`),
`requested_bytes`, `unlinked_bytes`, `free_delta_bytes`, `overshoot_bytes`, `shortfall_bytes`,
`u_protected_bytes`, `earliest_eligible_at`, and `skip_counts` (payload counts, once per reason).
The `skip_counts.in_use` key remains present and zero for `reclaim.free/1` compatibility.
`unlinked_bytes` sums logical sizes of entries actually unlinked, including directory entries;
sparse files can therefore satisfy SIZE while releasing few blocks. The signed statfs available
byte delta is measured separately and may reflect other writers, open files or hard links.
It is never used to decide `met`. A partial result reports its shortfall and the earliest known
U expiry (null if no known U-held burial); unknown burial has no invented eligibility time.
`u_protected_bytes_complete=false` labels incomplete accounting as a lower bound.
Busy includes the lock holder and elapsed wait, with zero unlinks. Exit codes are 0 only for met,
1 for partial/failed, 2 for invalid SIZE, and 3 for busy.

Each request has a 120-second cooperative work budget and 100,000 record/traversal visits,
including discovery, U accounting, revalidation and removal. The work deadline also spans lock
wait; the lock loop has its separate 10-second bound. Exhaustion during discovery performs no deletion; during preflight it retains that
payload. Exhaustion during unlinking reports the bytes actually unlinked. System calls must
return before a cooperative budget can stop work. Budget exhaustion and per-payload skips are
reported, and no background continuation is launched. The worker mutation guard also applies
to `free`; fixtures use temporary roots and state.
