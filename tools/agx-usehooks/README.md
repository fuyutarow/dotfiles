# agx-usehooks

“usehooks” names React-style `useXX` selectors: the IF side of an agent hook.
Projects own the THEN side and write their actions in TypeScript.

Projects write their actions in TypeScript. The optional second argument supplies an explicit kebab-case slug and wins over the default. When omitted, the project root directory basename is converted to kebab case and followed by `-prompt` or `-stop` (for example, `firedancer-prompt` and `firedancer-stop`). The root is discovered from the payload cwd, or the process cwd when unavailable; diagnostics before input is read use the process cwd. Context, Stop reasons, and diagnostics start with `[<slug>]`. `await onPrompt(fn, slug)` adds returned strings as
one `additionalContext` block; `await onStop(fn, slug)` blocks with their joined reason, except
when `stop_hook_active` is true. Callbacks receive `{ repoRoot, cwd, payload }` and return
`string | false | null | undefined` or an array, synchronously or asynchronously. Empty
entries disappear. Input errors, callback failures and the total 3 s timeout exit 0,
emit no stdout, and report one stderr line.

Conditions return values:

- `await runningRuns(ctx)`: live `{ id, lane, row }[]`; missing ticket lanes are `"other"`.
- `await scanRuns(ctx)`: the same live runs plus a count of unreadable markers; markers missing `run_id` or `pid` are skipped silently.
- `await runningRuns(ctx, { session, stateDirs })`: live runs whose `dispatcher_session` equals `session`, from optional explicit state directories.
- `await unattributedRuns(ctx)`: live runs without `dispatcher_session` whose marker cwd is inside `ctx.repoRoot`, separately from session counts.
- `await runningJobs(ctx, { session })`: running systemd user services, optionally filtered by exact unit session. Each job includes `id`, `attribution`, optional `session`, `cwd`, `kind`, and `labels`.
- `await unattributedJobs(ctx)`: running services classified as `projectUnattributed`.
- `await laneCount(ctx, lane, { session })`: number of live runs in that lane, optionally filtered by session.
- `await gpu(ctx)`: `{ nowPct, avg15Pct, avg60Pct, samples15, memUsedGiB, memTotalGiB } | "unknown"` (first GPU, 1 s timeout). Both averages are estimates and are `null` until their window has three samples. Reads share a locked, atomic two-hour history with statusline, sampling at jittered 10–20 s intervals when consumers run.
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
values (`AGX_KIND` and `AGX_LABELS` are also accepted). `procRoot` defaults to `/proc` and
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
    device !== "unknown" &&
      (device.avg15Pct ?? (device.samples15 <= 1 ? device.nowPct : null)) !== null &&
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
