# Changelog

## 0.2.0

- Add optional exact dispatcher-session filters to `runningRuns` and `laneCount`, retaining live-PID exclusion.
- Expose live runs without a dispatcher session through `unattributedRuns`.
- Type and validate the hook payload's `session_id` for session-aware project hooks.

## 0.1.1

- Resolve and cache the executable `nvidia-smi` path, including WSL and system fallbacks.

## 0.1.0

- Add fail-open prompt and stop helpers and bounded, value-only conditions.
- Share the reply-language segment rule with the existing Stop hook.
