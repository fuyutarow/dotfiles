# agx-usehooks

“usehooks” names React-style `useXX` selectors: the IF side of an agent hook.
Projects own the THEN side and write their actions in TypeScript.

Projects write their actions in TypeScript. `await onPrompt(fn)` adds returned strings as
one `additionalContext` block; `await onStop(fn)` blocks with their joined reason, except
when `stop_hook_active` is true. Callbacks receive `{ repoRoot, cwd, payload }` and return
`string | false | null | undefined` or an array, synchronously or asynchronously. Empty
entries disappear. Input errors, callback failures and the total 3 s timeout exit 0,
emit no stdout, and report one stderr line.

Conditions return values:

- `await runningRuns(ctx)`: live `{ id, lane, row }[]`; missing ticket lanes are `"other"`.
- `await runningRuns(ctx, { session })`: live runs whose `dispatcher_session` equals `session`.
- `await unattributedRuns(ctx)`: live runs without `dispatcher_session`, separately from session counts.
- `await laneCount(ctx, lane, { session })`: number of live runs in that lane, optionally filtered by session.
- `await gpu(ctx)`: `{ utilPct, freeGiB } | "unknown"` (first GPU, 1 s timeout).
- `await englishSegments(text)`: English prose segments using the reply-language hook rule.
- `await dirtyFor(ctx)`: oldest changed-file modification age in hours, or 0.
- `await unackedReturns(ctx)`: returned runs with no acknowledgement, as `{ id, lane, row }[]`.

State uses exported `STATE_DIR`, under `$XDG_STATE_HOME` or `~/.local/state`;
`AGX_STATE_DIR` overrides the full path. State reads have a 1 s budget.

`agx` writes `dispatcher_session` from the trimmed `CLAUDE_CODE_SESSION_ID` environment
variable. For Claude dispatches this is the same UUID as the hook payload's `session_id`,
not a worker name or PID; pass `ctx.payload.session_id` as the filter. Dispatches without
that environment variable remain unattributed. Omitting the filter returns all live runs;
an explicit session excludes unattributed runs. Project hooks should handle a missing
payload session explicitly rather than accidentally requesting host-wide counts.

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
      device.utilPct < 20 &&
      "GPU utilisation is under 20%.",
  ];
});
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
