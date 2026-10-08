# Changelog

## 0.2.0

- Refuse mutating run and approved delete commands from agent-dispatch workers unless HOME or reclaim state is isolated under a system tmp directory.

### Known issues

- The independent predicate suite is intermittently flaky under full-suite runs (about 1 failure per run, always on the refusal side: under-lock recheck / process-scan races). Passes in isolation. Root cause under investigation.

## 0.1.0

- Scaffold plan/run, targets, headroom, receipts, and the compatibility wrap command.
- Validate reclaim.plan/1 and receipt v1/v2 models; record v2 action receipts.
- Reuse the shared directory lock and storage policy; recheck candidates under the lock.
- Register all twelve targets, including workspaces before scratch in the blind tier.
- Rename the CLI to `disk-reclaim` and add guarded owner-approved deletion with v2 receipts.
- Move the standalone read-only headroom command to `tools/storage-headroom`.
- Share plan-scoped liveness and process facts; narrowly exempt allowlisted sshd EACCES probes.
- Add opt-in --fetch and isolated RECLAIM_CONFIG declarations; validate the complete tmp-HOME CLI and v2 receipts.
