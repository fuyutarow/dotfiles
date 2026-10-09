# use-hooks

Projects write their actions in TypeScript. `await onPrompt(fn)` adds returned strings as
one `additionalContext` block; `await onStop(fn)` blocks with their joined reason, except
when `stop_hook_active` is true. Callbacks receive `{ repoRoot, cwd, payload }` and return
`string | false | null | undefined` or an array, synchronously or asynchronously. Empty
entries disappear. Input errors, callback failures and the total 3 s timeout exit 0,
emit no stdout, and report one stderr line.

Conditions return values:

- `await runningRuns(ctx)`: live `{ id, lane, row }[]`; missing ticket lanes are `"other"`.
- `await laneCount(ctx, lane)`: number of live runs in that lane.
- `await gpu(ctx)`: `{ utilPct, freeGiB } | "unknown"` (first GPU, 1 s timeout).
- `await englishSegments(text)`: English prose segments using the reply-language hook rule.
- `await dirtyFor(ctx)`: oldest changed-file modification age in hours, or 0.
- `await unackedReturns(ctx)`: returned runs with no acknowledgement, as `{ id, lane, row }[]`.

State uses exported `STATE_DIR`, under `$XDG_STATE_HOME` or `~/.local/state`;
`AGENT_ROUTER_STATE_DIR` overrides the full path. State reads have a 1 s budget.

Register the package once with `cd <dotfiles>/tools/use-hooks && bun link`.
In the project, run `bun link use-hooks`, then import from `"use-hooks"`.
The repo's `mise run deps` installs dependencies and links the root package's CLI bins;
this library has no bin and needs the separate package registration above.

`.agents/hooks/prompt.ts`:

```ts
import { onPrompt, laneCount, gpu } from "use-hooks";

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
