# Changelog

## Unreleased

- Select running systemd user service jobs with session-first attribution, project-cwd fallback, and a shared 1 s subprocess budget.
- Scope unattributed markers to the hook project via marker cwd; retain optional name, kind, and labels for project classification.

## 0.3.0

- Add optional per-call `stateDirs` to `runningRuns`, `unattributedRuns`, and `laneCount`, without changing the shared default state home.
- Merge live runs by `run_id` across directories (first directory wins); tolerate missing directories and retain session filters within the existing 1 s read budget.

## 0.2.0

- Add optional exact dispatcher-session filters to `runningRuns` and `laneCount`, retaining live-PID exclusion.
- Expose live runs without a dispatcher session through `unattributedRuns`.
- Type and validate the hook payload's `session_id` for session-aware project hooks.

## 0.1.1

- Resolve and cache the executable `nvidia-smi` path, including WSL and system fallbacks.

## 0.1.0

- Add fail-open prompt and stop helpers and bounded, value-only conditions.
- Share the reply-language segment rule with the existing Stop hook.
