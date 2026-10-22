# agx-usehooks

Part of the [tools/ architecture](../spec/architecture.md).

“usehooks” names React-style `useXX` selectors: the IF side of an agent hook.
Projects own the THEN side and write their actions in TypeScript.

Projects write their actions in TypeScript. The optional second argument accepts `{ namespace, slug }`, or a string slug for existing callers. Explicit values win. The namespace defaults to the project root directory basename converted to kebab case, and the slug defaults to `prompt` or `stop` (for example, `[example-learner:stop]`). The root is discovered from the payload cwd, or the process cwd when unavailable; diagnostics before input is read use the process cwd. Context, Stop reasons, and diagnostics start with `[<namespace>:<slug>]`. `await onPrompt(fn, options)` adds returned strings as one `additionalContext` block; `await onStop(fn, options)` blocks with their joined reason, except when `stop_hook_active` is true. Callbacks receive `{ repoRoot, cwd, payload }` and return
`string | false | null | undefined` or an array, synchronously or asynchronously. Empty
entries disappear. Input errors, callback failures and the total 3 s timeout exit 0,
emit no stdout, and report one stderr line.

Conditions return values:

Fact helpers return validated scalar values for project hooks: `await launcherRunsToday(ctx, { project: ctx.repoRoot })` counts distinct launcher run receipts whose `started_at` falls on the host's local calendar day; `await minutesSinceLastResult(ctx, { project: ctx.repoRoot })` returns elapsed minutes since the newest receipt with a `result` and `ended_at`, or `null` when no such receipt exists; `await gpuUtil(ctx)` returns the current `nowPct`, or `null` when GPU sampling is unavailable. The first two read bounded tails of `$AGX_STATE_DIR/runs.jsonl` (default `$XDG_STATE_HOME/agx/runs.jsonl`, otherwise `~/.local/state/agx/runs.jsonl`) and the two newest dated `runs-YYYY-MM-DD.jsonl` ledger archives, filtering receipts by `cwd` within the supplied project path. Their schemas are `LauncherRunsTodaySchema`, `MinutesSinceLastResultSchema`, and `GpuUtilSchema`. **Semver rule:** these additive exports are a minor release; changing any exported shape requires a major version, including during 0.x.

The public GPU contract is `GpuReading | GpuUnavailable`, derived from exported
`GpuReadingSchema` and `GpuUnavailableSchema`; `GpuSchema` parses their union.
`RunSchema`, `RunsSchema`, and `LaneCountSchema` define `Run`, `Runs`, and
`LaneCount`. `gpu()`, `runningRuns()`, `unattributedRuns()`, and `laneCount()`
return the schemas' parsed output. An invalid internal value emits a contract diagnostic and returns a separately
parsed unavailable or empty fallback. Missing external state returns the documented
unavailable or empty value.
**Semver rule:** a changed exported shape requires a major version, even during
0.x. Adding exports without changing existing shapes is a minor version.

`consumers.toml` declares consumer roots, hook scopes, commands, and their
`link:agx-usehooks` link paths. `mise run usehooks:consumers` runs the declared consumer's
`bunx tsc --noEmit -p <root>`.
The exact project command runs first, followed by a read-only hook check using a
temporary config extending the project's config with `agx-usehooks` mapped to this
workspace. It changes no consumer files or symlinks. Hook diagnostics fail either check; diagnostics
elsewhere are reported, and compiler/config failures also fail. An absent checkout
prints `SKIP: consumer not present on this host`, never PASS; run the check on
a host where the declared consumer exists. Land invokes it before commit when this library
changes. The 0.8.0 migration and consumer impact are recorded in CHANGELOG.md;
the consumer owner migrates their hooks, with no `utilPct` compatibility alias.

- `await runningRuns(ctx)`: live `{ id, lane, row }[]`; missing ticket lanes are `"other"`.
- `await scanRuns(ctx)`: the same live runs plus a count of unreadable markers; markers missing `run_id` or `pid` are skipped silently.
- `await runningRuns(ctx, { session, stateDirs })`: live runs whose `dispatcher_session` equals `session`, from optional explicit state directories.
- `await unattributedRuns(ctx)`: live runs without `dispatcher_session` whose marker cwd is inside `ctx.repoRoot`, separately from session counts.
- `await runningJobs(ctx, { session })`: running systemd user services, optionally filtered by exact unit session. Each job includes `id`, `attribution`, optional `session`, `cwd`, `kind`, and `labels`.
- `await unattributedJobs(ctx)`: running services classified as `projectUnattributed`.
- `await laneCount(ctx, lane, { session })`: number of live runs in that lane, optionally filtered by session.
- `await gpu(ctx)`: `{ nowPct, avg15Pct, avg60Pct, samples15, memUsedGiB, memTotalGiB } | { unavailable: reason }` (first GPU). Reads the shared owner state without launching a process. Observations expire after 120 s; missing, stale and unresponsive states have explicit reasons. The owner samples at most once per 60 s and keeps a two-hour history. Averages are estimates and remain `null` until their window has three samples. See [GPU sampler operations](../shared/GPU-SAMPLER.md).
- `await englishSegments(text)`: English prose segments using the reply-language hook rule.
- `await dirtyFor(ctx)`: oldest changed-file modification age in hours, or 0.
- `await unackedReturns(ctx)`: returned runs with no acknowledgement, as `{ id, lane, row }[]`.

State uses exported `STATE_DIR`, under `$XDG_STATE_HOME` or `~/.local/state`;
`AGX_STATE_DIR` overrides the full path. State reads have a 1 s budget.
`runningRuns`, `unattributedRuns`, and `laneCount` accept optional `stateDirs: string[]`
per call, so callers can read migration roots without changing `process.env`. Omitting it
reads only the shared default home; an empty array reads no roots. Missing or unreadable
roots are ignored. Duplicate `run_id` values among selected live runs count once, with
the first directory winning. The 1 s budget covers the entire selection.

`agx` writes `dispatcher_session` from the trimmed `CLAUDE_CODE_SESSION_ID` environment
variable. For Claude dispatches this is the same UUID as the hook payload's `session_id`,
not a worker name or PID; pass `ctx.payload.session_id` as the filter. Dispatches without
that environment variable are project-unattributed only when the marker cwd is inside the
hook's project root. Missing or foreign cwd is excluded from `unattributedRuns`.
Detached dispatch captures this ID at dispatch into the unit's
`AGX_DISPATCHER_SESSION`; the detached child uses that captured value for the
active marker, independently of its vendor worker session.
Run selectors retain optional ticket name, kind, and labels (falling back to marker metadata).
Omitting the filter returns all live runs;
an explicit session excludes unattributed runs. Project hooks should handle a missing
payload session explicitly rather than accidentally requesting host-wide counts.

Job attribution uses the unit's nonempty `Environment` `CLAUDE_CODE_SESSION_ID` first,
even when its cwd is elsewhere. Otherwise a unit `WorkingDirectory` or main process cwd
inside `ctx.repoRoot` yields `projectUnattributed`; all others are `foreign`.
`runningJobs(ctx)` includes all three groups; project hooks must exclude foreign jobs and
other sessions. Failed, exited, unavailable, or slow services produce no live jobs.
The list and batched property read share a 1 s subprocess budget. Job kind and labels come
from optional `AGX_JOB_KIND` and comma/space-separated `AGX_JOB_LABELS` unit environment
values. The retired `AGX_KIND` and `AGX_LABELS` aliases are ignored; an alias without
its canonical variable emits an `agx-usehooks contract:` diagnostic naming the canonical
variable, while returning the job without that kind or with empty labels. Removing
accepted environment names requires a major release, including during 0.x.
`procRoot` defaults to `/proc` and
may be supplied for alternate proc mounts or fixtures.

Register the package once with `cd <dotfiles>/tools/agx-usehooks && bun link`.
In the project, run `bun link agx-usehooks`, then import from `"agx-usehooks"`.
The repo's `mise run deps` installs dependencies and links the root package's CLI bins;
this library has no bin and needs the separate package registration above.

`.agents/hooks/prompt.ts`:

```ts
import { onPrompt, laneCount, gpu } from "agx-usehooks";

await onPrompt(async (ctx) => {
  const [theory, device] = await Promise.all([
    laneCount(ctx, "theory"),
    gpu(ctx),
  ]);
  return [
    theory < 3 && "There are fewer than three theory runs.",
    !("unavailable" in device) &&
      (device.avg15Pct ?? (device.samples15 <= 1 ? device.nowPct : null)) !==
        null &&
      (device.avg15Pct ?? device.nowPct) < 20 &&
      "GPU utilisation is under 20%.",
  ];
}, "project-lanes");
```

Wire the project hook in its `.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bun .agents/hooks/prompt.ts",
            "timeout": 4
          }
        ]
      }
    ]
  }
}
```
