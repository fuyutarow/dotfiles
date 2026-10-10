# statusline

Package-owned statusline, ported from the former Claude implementation (re-synced to alpha cbc82bdc), version 0.2.1.
`agents/claude/settings.json` declares `statusLine.command` as `~/.bun/bin/statusline`, this package's `bin`
(root `package.json` `bin`, installed by `bun link` / `mise run deps`). The former Claude implementation
has been retired; parity fixtures preserve its expected behavior.

Run with Bun 1.4 or newer:

```sh
printf '%s' '{}' | bun tools/statusline/src/statusline.ts
bun test tools/statusline/tests
```

The input remains Claude Code statusline JSON on stdin; stdout retains the existing ANSI rows
and graceful invalid-input messages. Existing environment variables, cache locations, schema
checks, explicit absence messages, 2 s enrichment limits, 3 s agent lookup limit, 4 s shared
render deadline, 5 s GPU cache and 30 s agent-name cache are preserved. The GPU sampler remains
a bounded detached child of the local host-load module, using the original host-wide lock.

Dispatch worker rows begin with the roster row and elapsed time, followed by the active display ID
when present (for example, `luna-high 6m05s agt_lfix Repo: dotfiles…`). Older active markers
without a display ID retain the worker session head/tail format.

Storage still reads the canonical `agents/hooks/storage-headroom.toml` as runtime data, resolved
relative to this package rather than cwd. Only `storageLine` is imported from shared storage code.
Disk free GiB uses three significant figures. A fill/free rate appears at
0.05 GiB/min or more, with two significant figures and ↓/↑ arrows. Each render atomically updates
`$XDG_STATE_HOME/statusline/disk-rate.json` (default `~/.local/state/statusline/disk-rate.json`).
Linear regression over the last five minutes smooths short bursts; samples are spaced at least
five seconds apart, capped at 61 per drive, and must span at least 30 seconds. Missing or corrupt
state starts a new window silently. A capacity change, backwards clock step, or five-minute gap
also resets the window. Only free GiB carries the configured space threshold color; capacity,
free percentage, `free` and the entire rate suffix are dim supporting text.

Rate and Sys share the roles in `src/ansi.ts`: plain labels and windows, threshold-colored
values, dim secondary text and dim separators. Unknown values are amber `n/a` with dim reasons.
Jev's seven-day spend uses the same threshold function as percentages, with dollar boundaries
of $1 (yellow) and $5 (red); `Jev 7d` is plain and `spend` is dim. Memory fractions, GPU averages,
sample counts and stale details are also dim.
Dispatch state is read-only: local schemas cite the source lines and contain no state writers.
The JSON codec is copied locally; its Zod primitive comes from the allowed shared entrypoint,
which satisfies the repository rule against direct Zod imports and keeps the original schema engine.
Declared dependency pins match the root package. Installation and lockfile/deployment wiring are
outside this scaffolding step.

## Module map

| Module                  | Lines | Responsibility                                                            |
| ----------------------- | ----: | ------------------------------------------------------------------------- |
| src/ansi.ts             |    32 | ANSI vocabulary, absence markers, percentage colors                       |
| src/bounded.ts          |   150 | Shared 4 s render deadline, bounded subprocesses, atomic cache writes     |
| src/build-dataframe.ts  |   126 | Orchestrate enrichment in the original order                              |
| src/cgroup-memory.ts    |    64 | Read cgroup v1/v2 memory limits and working sets                          |
| src/dataframe.ts        |    54 | Typed facts passed to rendering                                           |
| src/dispatch-runs.ts    |   190 | Read dispatch markers/progress and render aligned worker rows             |
| src/dispatch-warning.ts |    84 | Codex-share warning from runs.jsonl and route-capability.json (read-only) |
| src/dispatch-state.ts   |    55 | Read-only dispatch wire schemas and file locations                        |
| src/format.ts           |   146 | Row assembly and prompt-head colors                                       |
| src/host-load.ts        |   537 | CPU/RAM/VRAM sampling, GPU lock/cache, Sys formatting                     |
| src/identity.ts         |   409 | Account, agent-name cache, Remote Control probe, herdr updates            |
| src/input.ts            |    54 | Nullable stdin payload schema                                             |
| src/jobs.ts             |   109 | Admitted jobs, scratchpad orphans, elapsed formatting                     |
| src/model-context.ts    |    60 | Model normalization and context labels                                    |
| src/prompt-stamp.ts     |    95 | Temporal clock, offset, tilde path and prompt fields                      |
| src/rate-limits.ts      |   158 | Scoped model caps, window percentages and reset countdowns                |
| src/repo-state.ts       |    36 | Bounded branch lookup and explicit git failures                           |
| src/statusline.ts       |    82 | Executable stdin entry, graceful errors and snapshot cache writes         |
| src/storage.ts          |   130 | Storage TOML reads, disk measurements, shared threshold calculation       |
| src/zod.ts              |    40 | Local JSON codecs using the shared Zod primitive                          |

## Exact source import list

- `src/ansi.ts`:
- `src/bounded.ts`: `node:child_process`, `node:fs`, `node:path`, `neverthrow`, `./zod.ts`
- `src/build-dataframe.ts`: `neverthrow`, `./input.ts`, `./dataframe.ts`, `./identity.ts`, `./rate-limits.ts`, `./model-context.ts`, `./repo-state.ts`, `./jobs.ts`, `./host-load.ts`, `./dispatch-runs.ts`, `./dispatch-warning.ts`
- `src/cgroup-memory.ts`:
- `src/dataframe.ts`: `neverthrow`, `./host-load.ts`, `./storage.ts`, `./identity.ts`, `./rate-limits.ts`, `./jobs.ts`, `./dispatch-runs.ts`
- `src/dispatch-runs.ts`: `node:fs`, `node:path`, `neverthrow`, `./zod.ts`, `./dispatch-state.ts`, `./ansi.ts`, `./jobs.ts`
- `src/dispatch-warning.ts`: `node:fs`, `node:os`, `node:path`, `neverthrow`, `./bounded.ts`, `./dispatch-state.ts`, `./prompt-stamp.ts`, `./zod.ts`
- `src/dispatch-state.ts`: `node:os`, `node:path`, `./zod.ts`
- `src/format.ts`: `./ansi.ts`, `./prompt-stamp.ts`, `./dataframe.ts`, `./model-context.ts`, `./rate-limits.ts`, `./jobs.ts`, `./dispatch-runs.ts`, `./host-load.ts`
- `src/host-load.ts`: `node:child_process`, `node:fs`, `node:path`, `node:os`, `neverthrow`, `./storage.ts`, `./cgroup-memory.ts`, `./zod.ts`, `./ansi.ts`, `./bounded.ts`
- `src/identity.ts`: `node:fs`, `node:net`, `neverthrow`, `./zod.ts`, `./input.ts`, `./bounded.ts`
- `src/input.ts`: `./zod.ts`
- `src/jobs.ts`: `./bounded.ts`, `./ansi.ts`, `./prompt-stamp.ts`
- `src/model-context.ts`: `./ansi.ts`, `./dataframe.ts`
- `src/prompt-stamp.ts`: `node:os`
- `src/rate-limits.ts`: `neverthrow`, `./zod.ts`, `./input.ts`, `./prompt-stamp.ts`, `./ansi.ts`, `./dataframe.ts`
- `src/repo-state.ts`: `./bounded.ts`, `./model-context.ts`
- `src/statusline.ts`: `./ansi.ts`, `./bounded.ts`, `./zod.ts`, `./input.ts`, `./prompt-stamp.ts`, `./format.ts`, `./build-dataframe.ts`, `./host-load.ts`, `./model-context.ts`, `./rate-limits.ts`
- `src/storage.ts`: `node:fs`, `node:path`, `neverthrow`, `../../shared/src/storage-headroom.ts`, `./zod.ts`, `./bounded.ts`, `./ansi.ts`
- `src/zod.ts`: `neverthrow`, `../../shared/src/zod.ts`

Imports resolve only within this package and `tools/shared/`, plus builtins and `neverthrow`.
No source module imports agent code or another tool package.

## Verification

The three original suites are ported, including the under-6-second worst-case render test,
GPU single-sampler concurrency and atomic-cache cases, and real zsh prompt-head comparison.
Tests use isolated HOME/PATH fixtures; the CPU-number assertion accepts existing padded percentages.
The OLD/NEW parity test runs both entries against the same stdin, environment and HOME, resetting
caches and freezing time/host syscalls via a subprocess preload. Six stdin fixtures and fourteen dispatch-state variants (codex-share warning shown and suppressed,
UUIDv7-prefix and tail collisions, resume marks, short/empty ids) compare exact ANSI
stdout and Sys snapshot bytes; the session fixture also compares Ctx/Rate snapshot bytes.
Host syscall fixtures affect both entries equally; separate ported integration tests exercise
the actual host readings and real subprocess failure/timeout behavior.

Repository checks: `mise run lint:ts` and `mise run typecheck`. The module map and import list above
can be checked independently of unrelated concurrent edits elsewhere in this repository.
