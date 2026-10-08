# Changelog

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
