# Changelog

## 1.4.6 — 2026-10-16

- Expire rip payloads incrementally within a two-minute work budget, retaining partial progress and avoiding a full graveyard census before deletion.

## 1.4.5 — 2026-10-16

- Allow deleted graveyard payloads to expire regardless of process-use evidence while retaining other deletion guards.
- Expire rip payloads by record time above the graveyard size cap, including fresh nested entries and native rip timestamps.

## 1.4.4 — 2026-10-16

- Bound unattended rip expiry by the doctor 10 GiB ceiling, expiring oldest entries first even before 24 hours.

## 1.4.3 — 2026-10-16

- Update CLI test config fixtures to use the regenerable cache policy derived from .gitignore.

## 1.4.2 — 2026-10-16

- Restore owner access during read-only fixture teardown and align CLI fixture declarations with the current schema.

## 1.4.1 — 2026-10-16

- Replace non-null assertions with checked values in delete, host planning, and regression tests.

## 1.4.0 — 2026-10-16

- The rip graveyard is a declared delete root: delete graveyard subtrees while retaining uid, live-process, protected-path and filesystem checks, and allow already-deleted repo stores. Process tmpfs and expired graveyard subtrees small-first with --only scoping, candidate-local rechecks, stage-wide liveness snapshots and constant mount measurements. Avoid quadratic cross-target ownership comparisons. Verify cumulative 100k tmpfs candidates and 1M graveyard files in disk-backed batches below 100k entries, with explicit wall-clock bounds and finally cleanup.

## 1.3.4 — 2026-10-15

- Read regenerable repository paths from the root `.gitignore` declaration so disk-reclaim and Git share one cache list.

## 1.3.3 — 2026-10-15

- Keep user-session dbus and gnupg paths and accept --no-progress for apply

## 1.3.2 — 2026-10-14

- Reclaim stale, owned tmpfs directories regardless of naming convention, using one bounded ownership, age and sizing walk; keep protected, open and fresh trees safe and report incomplete scans as ASK.
- Keep both main and worker scan caches under XDG cache storage with a 2,048-entry eviction cap, and remove cache and audit/purge test fixtures after their suites.

## 1.3.1 — 2026-10-14

- Bound rip graveyard size scans to 40 seconds and report incomplete measurements as conservative lower bounds.

## 1.3.0 — 2026-10-13

- Invalidate workspace classification caches when the regenerable-tool-cache policy changes, including changes back to a more restrictive policy.
- Allow progressing plans to finish regardless of elapsed time; stop only stalled tree scans, and count metadata probes as progress.

- Reuse per-root scan measurements and discovery results with shallow metadata change keys; refresh process/session safety and bypass caches for run-time revalidation.
- Report target timing and cache activity, and stop worker scans without advancing counters or metadata probes.
- Skip unreachable Windows hosts after one five-second SSH probe instead of waiting ninety seconds.
- Drain large plan output before exiting so coordinators receive a complete document.

## 1.2.1 — 2026-10-12

- Discover legacy graveyard-* directories on tmpfs/ramfs and permanently purge them in the blind tier, reporting bytes and inode entry counts.

## 1.2.0 — 2026-10-12

- Add tmpfs usage reporting, safe stale temporary-directory cleanup, and verified relocation of RAM-backed rip graveyards.

## 1.1.5 — 2026-10-12

- Treat rumdl, Ruff, pytest, mypy, and node_modules tool caches as regenerable workspace content.
- Frame Windows PowerShell script transfer as one base64 line rather than waiting for SSH stdin EOF; bound the read-only probe to 90 seconds with a 10-second SSH connection timeout.
- Report the current SSH/PowerShell step on stderr and name the last step on timeout, without emitting partial candidate records.
- Preserve PID, comm, and executable identity for unknown unreadable same-uid processes; keep their conservative ASK verdict.
- Report allocated Windows VSS shadow storage as owner-only ASK records; never apply it, including with approval flags.
- Declare sccache and Homebrew caches REGENERABLE and keep them while their tools are running.

## 1.1.3 — 2026-10-12

- Summarize `--yes` results for humans, log one final per-path outcome as JSONL, and refuse contradictory duplicate plan records before acting.

## 1.1.2 — 2026-10-12

- Handle SIGINT and SIGTERM promptly, stop active scan workers and SSH probes, and finish only the current deletion item before reporting what was removed; a second interrupt forces exit.

## 1.1.1 — 2026-10-12

- Keep reclaiming healthy targets when workspace listing or the Windows host probe fails; report each failed target and exit 1 when any target fails.
- Skip only unreadable workspace stores, preserve healthy workspace candidates, and finish progress output cleanly after target failures.

## 1.1.0 — 2026-10-11

- Emit Windows host levers as JSONL records with allocated SizeOnDisk bytes, including Windows Update, crash dumps, tool caches, and owner-only system items.
- Fail with the SSH/PowerShell step and captured output when the Windows probe fails or returns no usable data.
- Keep remote Windows records out of local apply unless a local fingerprint exists.

## 1.0.0 — 2026-10-11

- Add the JSONL candidate record pipeline with per-record fingerprint and liveness revalidation.
- Collapse mise entrypoints to reclaim and reclaim:yes.
- Measure Windows host allocation and keep off-TTY progress silent.

## 0.6.0

- Add blind-tier expiry for rip graveyard entries older than the configured 24-hour retention; XDG Trash remains owner-only.
- Restore owner write permission on read-only directories before purging, so mode-500 graveyard trees can be removed.
- Read the shared RIP_GRAVEYARD location instead of assuming rip's RAM-backed /tmp default.

## 0.5.1 — 2026-10-11

- Classify exact `sshd`, `sshd-session`, and `(sd-pam)` proc identities as expected unreadable
  privilege-boundary processes, using comm or executable basename while preserving unknown
  status for every other unreadable same-uid process.

## 0.5.0 — 2026-10-11

- Render concurrent progress with shared Clack taskLog groups on stderr; collapse finished rows, retain scan counters across heartbeats, show rates and known deletion ETAs, and finalize the region on errors and signals.
- Keep CI, pipes, dumb terminals, and JSON output free of terminal escape codes; add a final human summary table without changing the JSON plan schema.
- Aggregate unreadable live-process probes by cause, classify expected permission boundaries, identify affected ASK targets, and expose per-probe details with `--verbose`.
- Avoid probing sudo outside WSL and prevent Bun cache command output from interrupting the progress region.
- Keep preflight and later tasks in one region and deliver counters during synchronous directory-size walks.
- Exclude expected same-uid non-dumpable process EACCES from in-use uncertainty after identity revalidation; preserve readable positive use and show allocated workspace bytes for ASK and KEEP rows too.

## 0.4.3

- Cache a capped list of safe blind-tier plan candidates for actionable storage-headroom denials.
- Report WSL guest free-space change separately from Windows C: free-space return, including the lazy sparse-VHDX and offline-compaction note.

## 0.4.2

- Restrict the Windows winget-cache cleanup root to `%TEMP%\WinGet`, excluding installed portable packages and links under `%LOCALAPPDATA%\Microsoft\WinGet`.

## 0.4.1

- Run Windows host PowerShell probes from a temporary script file over SSH and ignore WSL registry entries without a BasePath, preserving the C: measurement.
- Detect WSL in non-interactive SSH shells through procfs when `WSL_DISTRO_NAME` is absent.
- Resolve same-uid executable, open-file, and mapped-file paths independently from environment-based session liveness.

## 0.4.0

- Report every discovered `target/` directory in the Rust tier with its size and a RECLAIM, KEEP, or ASK verdict; recency now orders rows instead of hiding them.
- Tie Rust target KEEP decisions to same-uid build processes that use that workspace or target, and ask when process state is unreadable or the repo has a live session.
- Show `incremental/` as a separate sized row when target liveness requires an operator decision.
- Keep a containing workspace protected while deciding its Rust target independently in the Rust tier.

## 0.3.1

- Allow purging recent graveyard entries below the shared host deny line with `--under-pressure`, while preserving live, locked, and 10-minute undo-window entries; record headroom and the flag in receipts.

## 0.3.0

- Render bounded scan and delete progress with TTY redraws or rate-limited plain lines, and connect disk-reclaim mise tasks directly to the terminal.
- Scan independent targets concurrently and remove preflight-approved trees with a bounded unlink/rmdir work queue.
- Refuse an entire tree before deletion when traversal finds an ownership, filesystem, immutable-flag, or protection failure.

## 0.2.2

- Fix a workspace plan failing schema validation (exit 2) when a live same-uid cwd was found alongside an unreadable same-uid process (e.g. `systemd --user` on a shared host): the positive in-use fact now yields KEEP with a definite "not in use" failure, and the unreadable process is still reported in its detail. An unreadable process with no positive fact remains ASK, never idle.

## 0.2.1

- Resolve the process root in one place and report unavailable process scans explicitly; all mutating paths remain fail-closed when idleness cannot be established.
- Canonicalize test roots from the real system temp directory so macOS `/var` aliases do not trigger the real-path safety refusal.
- Keep the Linux full-suite process-scan race under investigation.

## 0.2.0

- Refuse mutating run and approved delete commands from agent-dispatch workers unless HOME or reclaim state is isolated under a system tmp directory.

### Known issues

- On Linux, the independent predicate suite has an intermittent refusal-side failure under full-suite runs (under-lock recheck / process-scan race). Root cause remains under investigation; reproduce and fix on a Linux host.

## 0.1.0

- Scaffold plan/run, targets, headroom, receipts, and the compatibility wrap command.
- Validate reclaim.plan/1 and receipt v1/v2 models; record v2 action receipts.
- Reuse the shared directory lock and storage policy; recheck candidates under the lock.
- Register all twelve targets, including workspaces before scratch in the blind tier.
- Rename the CLI to `disk-reclaim` and add guarded owner-approved deletion with v2 receipts.
- Move the standalone read-only headroom command to `tools/storage-headroom`.
- Share plan-scoped liveness and process facts; narrowly exempt allowlisted sshd EACCES probes.
- Add opt-in --fetch and isolated RECLAIM_CONFIG declarations; validate the complete tmp-HOME CLI and v2 receipts.
