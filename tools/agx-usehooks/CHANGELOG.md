# Changelog

## 0.6.0 — 2026-10-10

- Accept an optional project-supplied kebab-case slug as the second argument to onPrompt/onStop; explicit slugs win.
- Preserve existing one-argument calls with a default derived from the project directory basename plus `-prompt` or `-stop`, converted to kebab case.
- Prefix injected context, Stop reasons and failure diagnostics with `[<slug>]`.

## 0.5.1 — 2026-10-10

- Select runs through the shared forward-compatible agx marker reader and expose unreadable-marker counts through `scanRuns`.

## 0.5.0 — 2026-10-10

- Return validated current utilization, 15/60-minute estimates, sample count and VRAM usage from a shared two-hour GPU history. Averages require three samples; unknown readings never become default numbers.
- Share rate limiting and jittered 10–20 s sampling with statusline instead of treating a single burst as sustained saturation.

## 0.4.0 — 2026-10-10

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
