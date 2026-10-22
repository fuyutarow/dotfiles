# Changelog

## 1.0.1 — 2026-10-23

- Use neutral consumer names in hook runtime fixtures

## 1.0.0 — 2026-10-23

- Remove AGX_KIND and AGX_LABELS job environment aliases; diagnose alias-only metadata with the canonical variable name.

## 0.11.1 — 2026-10-17

- Read GPU owner state and report stale or unresponsive observations.

## 0.11.0 — 2026-10-16

- usehooks:consumers typechecks each consumer against alpha's agx-usehooks and the workspace's and fails only on diagnostics the workspace adds; a consumer already broken on alpha is PRE-EXISTING with its error count, and an untouched tools/agx-usehooks tree is SKIP

## 0.10.0 — 2026-10-12

- Export zod-validated `launcherRunsToday(ctx, { project })`, `minutesSinceLastResult(ctx, { project })`, and `gpuUtil(ctx)` facts. Launcher counts and result age read bounded tails of agx's `runs.jsonl` ledger and its dated archives; project attribution uses each receipt's `cwd`. GPU utilization reuses `gpu(ctx)` and yields `null` when unavailable.
- Export the three fact schemas and output types. This is additive under the 0.x minor-version rule; existing exported shapes are unchanged.

## 0.9.0 — 2026-10-11

- Export runtime schemas and their derived types for GPU readings, unavailable readings, runs and lane counts. All four selectors return parsed values. Invalid internal output emits a contract diagnostic and returns a separately parsed fail-open fallback.
- Declare example-learner's hook consumer and add `mise run usehooks:consumers`; land runs it before commit when this library changes. The check resolves this workspace without changing consumer files or links, fails on hook diagnostics, reports other diagnostics, and explicitly skips absent checkouts.
- Establish the public version rule: changing an exported shape requires a major version, including during 0.x. This release adds schemas without changing the existing 0.8.0 value shapes.

## 0.8.0 — 2026-10-11

- **Breaking, previously unannounced:** `gpu()` changed from `{ utilPct } | "unknown"` to `GpuReading { nowPct, avg15Pct, avg60Pct, samples15, memUsedGiB, memTotalGiB } | GpuUnavailable { unavailable }`. Example-learner `.agents/hooks/lanes.ts:106–107` read `device.utilPct` and compared the value with `"unknown"`, causing TS2339/TS2367 and a Bun stop hook displaying `GPU undefined%`. The consumer owner must migrate those references to `device.nowPct` and narrow with `"unavailable" in device` before reading it. No compatibility alias is provided: a rename replaces every reference. Under the public version rule this shape change should have been a major release.

- Keep live-run selection on structured agx active markers, including the expanded agx 2.9.0 ticket shape; the `ps` column change (`id` → `ticket`, `run_id` moved last) cannot shift hook parsing.
- Return the GPU sampling failure reason instead of collapsing it to an opaque unknown value. WSL discovery checks PATH and `/usr/lib/wsl/lib/nvidia-smi` with the existing bounded query.

## 0.7.0 — 2026-10-10

- Prefix context, Stop reasons and diagnostics with `[<namespace>:<slug>]`.
- Accept `{ namespace, slug }` options; default to the project basename and `prompt` or `stop`. Existing string-slug arguments remain supported.

## 0.6.1 — 2026-10-10

- Read unacknowledged-return history from a bounded tail of `runs.jsonl`.

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
