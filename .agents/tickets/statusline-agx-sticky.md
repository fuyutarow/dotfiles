+++
schema = 2
name = "statusline-agx-sticky"
outcome = "every statusline field keeps rendering its last good value: today under load (load1 ~85-120 on 12 cores, 2026-10-16 10:13) the agx section renders only `agx n/a (dispatch timeout 2000ms)` and drops every worker row, and the Rate line often shows `codex: n/a`; the owner's rule (2026-10-16): '10s stale は許容、1m old ならいい、表示が消失するのは論外', and it applies to EVERY field, not only agx. Define one shared field-state type — fresh(value), stale(value, age), unknown(reason) only when no good value was ever read — as a closed TypeScript discriminated union with exhaustive rendering, plus one persisted last-good store per field (the agx snapshot in tools/statusline/src/agx-snapshot.ts is the existing example); route every field through it: agx workers, Rate (claude 5h/7d, codex 7d, Jev), Sys (CPU, RAM, VRAM, GPU, tmpfs, Disk C, Disk WSL), Job, and any other section that reads something that can fail or time out. Stale values render with their age (e.g. `· 1m old`); no field path can render empty or n/a while a last good value exists. Why codex reads fail is a separate ticket (codex-usage-na); here only the display contract"
writes = ["tools/statusline/src/**", "tools/statusline/tests/**", "tools/statusline/.changes/*.md"]
verify = ["bun test tools/statusline", "mise run lint:ts", "mise run typecheck", "mise run lint:no-sync"]
timeout_s = 2700
premises = ["file:tools/statusline/src/agx-snapshot.ts", "file:tools/statusline/src/build-dataframe.ts"]

[proposition]
id = "STATUSLINE-AGX-STICKY"
claim = "a table in the return lists every statusline field and the file:line where it now goes through the shared type; tests: with a snapshot of 3 running workers on disk and the live read timing out, the output still contains all 3 worker rows plus an age marker; with no snapshot ever written it shows `agx n/a (<reason>)`; the display state is a closed union type (TypeScript discriminated union, exhaustive switch) with no other path to an empty section; live probe: run the installed statusline with AGX dispatch read forced to time out (env or fixture) and paste the rendered agx lines into checks"
refuted_by = "any test or live render where worker rows vanish while a snapshot exists, or a display path outside the union"
+++

Read tools/statusline/src/build-dataframe.ts (the `dispatch warning` row at :327) and agx-snapshot.ts first. Keep the
2000 ms read budget; stickiness must come from the snapshot, not from a longer wait. Add no sync calls. Do not rebase;
land rebases. Record `mise run hook:pre-commit` exit code and last line in the checks field of your JSON return. Test
data outside the workspace. Do not commit or push.

## Current state (coordinator — single current version)
Accepted on substance. Land's rebase onto alpha conflicted with statusline-tmpfs (d6e6a985) and codex-usage-na (583a5cea),
which landed first: tools/statusline/src/host-load.ts, the render-golden snapshot and golden fixtures. The coordinator
rebased this workspace onto alpha. Resolve the conflicts by meaning (edit files; do not run jj): keep alpha's tmpfs segment
and its shared codex reader, and route them through your field-state type. Regenerate goldens and the snapshot only via
the tests' own update path, then run `bun test tools/statusline` and `mise run hook:pre-commit`.

