# statusline

Part of the [tools/ architecture](../spec/architecture.md) (report: invariant I-R3).

Package-owned statusline, ported from the former Claude implementation. The first row ends
with the version imported from `package.json`.
`agents/claude/settings.json` declares `statusLine.command` as `~/.bun/bin/statusline`, this package's `bin`
(root `package.json` `bin`, installed by `bun link` / `mise run deps`). The former Claude implementation
has been retired; parity fixtures preserve its expected behavior.

Run with Bun 1.4 or newer:

```sh
printf '%s' '{}' | bun tools/statusline/src/statusline.ts
statusline
statusline sessions --cwd . --json
statusline payload <session-id>
statusline --codex --cwd "$HOME/dotfiles"
statusline --codex --thread 01a1291d-5a63-76d3-a760-021ebaabf5f2
statusline --codex
bun test tools/statusline/tests
```

## Codex display contract

| Invocation                                              | Behavior                                                                                                             |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `statusline --codex` on a TTY                           | Live in-place refresh every 5 seconds; `q` or Ctrl+C exits.                                                          |
| `statusline --codex` without a TTY                      | One snapshot, preserving the existing output bytes.                                                                  |
| `statusline --codex --once`                             | One snapshot with a trailing newline.                                                                                |
| `statusline --codex --watch [--interval N]`             | Explicit live display; `--watch` requires TTY stdout. Interval is finite 1–3600 seconds and only valid in live mode. |
| `--watch --once`, or Codex-only flags without `--codex` | Usage error (exit 2).                                                                                                |

Live mode selects the initial rollout once, then rereads that session ID on every frame. It never switches to a newer same-directory session. The display uses the alternate screen and hides the cursor while active, then restores terminal state on exit or signal.

The Claude adapter parses Claude Code statusline JSON on stdin and normalizes it to the provider-neutral
`SessionStatus` contract; stdout retains the existing ANSI rows and graceful invalid-input messages.
With empty stdin or a terminal, `statusline` discovers live Claude Code and Codex processes in the
current directory and renders one block per session, newest first. `statusline sessions --cwd DIR
--json` emits one JSON record per session; `statusline payload SESSION_ID` emits the renderer
payload for that live session. When no session is present, host and
dispatch rows still render with `no agent session in <cwd>`. `--watch [SECONDS]` redraws discovered
sessions in place (default five seconds); `--interval N` remains an equivalent interval option
(1–3600 seconds). Non-empty piped payloads
continue through the original renderer path unchanged.
On Linux, `statusline-sampler.timer` owns collection and refreshes five seconds after
each completed sample. It publishes `$XDG_STATE_HOME/statusline/owner.json` (default
`~/.local/state/statusline/owner.json`) with separate observation timestamps. A failed
collection retains the last successful value and its timestamp. The systemd service
and its runtime lock prevent overlapping samples. GPU observations still come from
the separate GPU owner.

Rendering reads that owner file, the three agx owner files, transcripts and the selected
PIDs under `/proc`. It never launches a collector, fetches a rate, writes a cache or waits
for a session render lock. Standalone discovery uses the sampler's live session inventory;
`statusline sessions` explicitly performs discovery when requested. The sampler removes
the retired `fields/`, `renders/` and `sources/` directories and old temporary files.
`STATUSLINE_OWNER_STATE`, `STATUSLINE_CACHE_ROOT` and `STATUSLINE_DISK_RATE_STATE` allow
isolated sampler probes without changing deployed host files.

Claude context counts include input, cache-read and cache-creation tokens from the latest
request. A supplied current usage takes precedence over cumulative input totals.
The repository segment shows the sampled jj workspace name; payload git worktree names
are ignored. Outside a repository there is no workspace-name segment or workspace `here` count.

Codex CLI has no command-driven statusline setting, so tmux renders the Codex adapter outside the
TUI. `--codex` with no other flags uses the current directory; `--cwd` selects by the supplied
directory, `--pid` reads the process cwd through `/proc`, and `--thread` selects the
rollout whose filename ends in the supplied thread ID. Cwd and PID selection use the newest rollout
whose `session_meta.cwd` matches and whose `originator` is `codex-tui`, skipping
`codex_exec` workers. A snapshot selection with no match prints one dim line and exits; live
`--watch` keeps polling until it finds a session. Codex
output omits Claude-only identity, rate-window, diff and cost fields. An unknown thread ID prints
one error line naming that ID and exits non-zero. The adapter reads bounded
metadata and event tails, normalizes them to `SessionStatus`, and leaves missing Codex context or
rate data as explicit n/a slots. tmux checks `pane_current_command`, supplies the active pane cwd,
and refreshes through its existing five-second `status-interval`. Herdr's command entries are
tab-bar-wide; its pane metadata is display-only, so neither provides tmux's active-pane command
format.

Dispatch worker rows show the roster row, elapsed time, cost, worker/workspace name and ticket.
Session IDs remain in the data and are omitted from worker rows. Legacy `agx-<slug>` worker names
display as `agt_<slug>`. The summary always includes `dispatch warning: none` when no warning is
present. Its lost count uses the same `orphaned` classification as `agx doctor`, excluding legacy
history and ended runs with missing returns.

Storage still reads the canonical `agents/hooks/storage-headroom.toml` as runtime data, resolved
relative to this package rather than cwd. Only `storageLine` is imported from shared storage code.
Disk free GiB uses three significant figures. A fill/free rate appears at
0.05 GiB/min or more, with two significant figures and ↓/↑ arrows. The sampler atomically updates
`$XDG_STATE_HOME/statusline/disk-rate.json` (default `~/.local/state/statusline/disk-rate.json`).
Linear regression over the last five minutes smooths short bursts; samples are spaced at least
five seconds apart, capped at 61 per drive, and must span at least 30 seconds. Missing or corrupt
state starts a new window silently. A capacity change, backwards clock step, or five-minute gap
also resets the window. The free GiB amount is colored from free-space percentage: red below 10%,
yellow below 20%, green otherwise; capacity, free percentage, `free` and the entire rate suffix
are dim supporting text.

Rate values use pace (`used% ÷ elapsed%`): green through 1.0, yellow through 1.5, red above 1.5
or at 90% usage. During the first 2% of a window, usage-threshold color is used unless usage is
already at least 90%. Rate and Sys share the roles in `src/ansi.ts`: plain labels and windows,
colored values, dim secondary text and dim separators. Unknown values are amber `n/a` with dim
reasons.
Jev's seven-day spend uses the same threshold function as percentages, with dollar boundaries
of $1 (yellow) and $5 (red); `Jev 7d` is plain and `spend` is dim. Memory fractions, GPU averages,
sample counts and stale details are also dim.
Dispatch state is read-only: local schemas cite the source lines and contain no state writers.
The JSON codec is copied locally; its Zod primitive comes from the allowed shared entrypoint,
which satisfies the repository rule against direct Zod imports and keeps the original schema engine.
Declared dependency pins match the root package. Installation and lockfile/deployment wiring are
outside this scaffolding step.

## Module map

| Module                            | Lines | Responsibility                                                            |
| --------------------------------- | ----: | ------------------------------------------------------------------------- |
| src/session-status.ts             |    38 | Provider-neutral session facts consumed by the dataframe builder          |
| src/adapters/claude-statusline.ts |    89 | Claude stdin schema and normalization boundary                            |
| src/adapters/codex-rollout.ts     |   467 | Cached rollout selection with fresh streamed settings and context         |
| src/ansi.ts                       |    32 | ANSI vocabulary, absence markers, percentage colors                       |
| src/bounded.ts                    |   150 | Shared 4 s render deadline, bounded subprocesses, atomic cache writes     |
| src/build-dataframe.ts            |   544 | Orchestrate enrichment and short-TTL source caches                        |
| src/cgroup-memory.ts              |    64 | Read cgroup v1/v2 memory limits and working sets                          |
| src/dataframe.ts                  |    54 | Typed facts passed to rendering                                           |
| src/dispatch-runs.ts              |   190 | Read dispatch markers/progress and render aligned worker rows             |
| src/dispatch-warning.ts           |    84 | Codex-share warning from runs.jsonl and route-capability.json (read-only) |
| src/dispatch-state.ts             |    55 | Read-only dispatch wire schemas and file locations                        |
| src/format.ts                     |   146 | Row assembly and prompt-head colors                                       |
| src/host-load.ts                  |   537 | CPU/RAM/VRAM sampling, GPU lock/cache, Sys formatting                     |
| src/identity.ts                   |   409 | Account, agent-name cache, Remote Control probe, herdr updates            |
| src/jobs.ts                       |   109 | Admitted jobs, scratchpad orphans, elapsed formatting                     |
| src/live.ts                       |     — | Serialized Codex TTY refresh loop and terminal cleanup                    |
| src/model-context.ts              |    60 | Model normalization and context labels                                    |
| src/prompt-stamp.ts               |    95 | Temporal clock, offset, tilde path and prompt fields                      |
| src/rate-limits.ts                |   158 | Scoped model caps, window percentages and reset countdowns                |
| src/render-cache.ts               |   205 | Persistent source caches and per-session cross-process render guard       |
| src/repo-state.ts                 |    36 | Bounded branch lookup and explicit git failures                           |
| src/statusline.ts                 |   359 | Claude/Codex entry, live refresh, render guard and snapshot writes        |
| src/storage.ts                    |   130 | Storage TOML reads, disk measurements, shared threshold calculation       |
| src/zod.ts                        |    44 | Local JSON codecs and nullable-field schema helper                        |

## Exact source import list

- `src/ansi.ts`:
- `src/bounded.ts`: `node:child_process`, `node:fs`, `node:path`, `neverthrow`, `./zod.ts`
- `src/build-dataframe.ts`: `node:fs/promises`, `node:path`, `neverthrow`, `./session-status.ts`, `./dataframe.ts`, `./identity.ts`, `./rate-limits.ts`, `./model-context.ts`, `./repo-state.ts`, `./jobs.ts`, `./host-load.ts`, `./dispatch-runs.ts`, `./dispatch-warning.ts`, `./render-cache.ts`, `./storage.ts`, `./zod.ts`, `./dispatch-state.ts`, `./bounded.ts`, `./codex-rate.ts`, `./jev-usage.ts`
- `src/cgroup-memory.ts`:
- `src/dataframe.ts`: `neverthrow`, `./host-load.ts`, `./storage.ts`, `./identity.ts`, `./rate-limits.ts`, `./jobs.ts`, `./dispatch-runs.ts`
- `src/dispatch-runs.ts`: `node:fs`, `node:path`, `neverthrow`, `./zod.ts`, `./dispatch-state.ts`, `./ansi.ts`, `./jobs.ts`
- `src/dispatch-warning.ts`: `node:fs`, `node:os`, `node:path`, `neverthrow`, `./bounded.ts`, `./dispatch-state.ts`, `./prompt-stamp.ts`, `./zod.ts`
- `src/dispatch-state.ts`: `node:os`, `node:path`, `./zod.ts`
- `src/format.ts`: `./ansi.ts`, `./prompt-stamp.ts`, `./dataframe.ts`, `./model-context.ts`, `./rate-limits.ts`, `./jobs.ts`, `./dispatch-runs.ts`, `./host-load.ts`
- `src/host-load.ts`: `node:child_process`, `node:fs`, `node:path`, `node:os`, `neverthrow`, `./storage.ts`, `./cgroup-memory.ts`, `./zod.ts`, `./ansi.ts`, `./bounded.ts`
- `src/identity.ts`: `node:fs`, `node:net`, `neverthrow`, `./zod.ts`, `./bounded.ts`
- `src/live.ts`:
- `src/session-status.ts`: (types only)
- `src/adapters/claude-statusline.ts`: `../bounded.ts`, `../zod.ts`, `../session-status.ts`
- `src/adapters/codex-rollout.ts`: `node:fs/promises`, `node:path`, `../session-status.ts`, `../../../shared/src/jsonl.ts`, `./codex-settings-stream.ts`, `../zod.ts`, `../render-cache.ts`
- `src/jobs.ts`: `./bounded.ts`, `./ansi.ts`, `./prompt-stamp.ts`
- `src/model-context.ts`: `./ansi.ts`, `./dataframe.ts`
- `src/prompt-stamp.ts`: `node:os`
- `src/rate-limits.ts`: `neverthrow`, `./zod.ts`, `./prompt-stamp.ts`, `./ansi.ts`, `./dataframe.ts`
- `src/render-cache.ts`: `node:fs/promises`, `node:os`, `node:path`, `./zod.ts`
- `src/repo-state.ts`: `./bounded.ts`, `./model-context.ts`
- `src/statusline.ts`: `node:fs/promises`, `cleye`, `./ansi.ts`, `./bounded.ts`, `./zod.ts`, `./adapters/claude-statusline.ts`, `./adapters/codex-rollout.ts`, `./session-status.ts`, `./prompt-stamp.ts`, `./format.ts`, `./build-dataframe.ts`, `./codex-rate.ts`, `./host-load.ts`, `./model-context.ts`, `./rate-limits.ts`, `./live.ts`, `./dataframe.ts`, `./render-cache.ts`
- `src/storage.ts`: `node:fs`, `node:path`, `neverthrow`, `../../shared/src/storage-headroom.ts`, `./zod.ts`, `./bounded.ts`, `./ansi.ts`
- `src/zod.ts`: `neverthrow`, `../../shared/src/zod.ts`

Imports resolve only within this package and `tools/shared/`, plus builtins and `neverthrow`.
No source module imports agent code or another tool package.

## Verification

Run the fixture-only render benchmark with `bun tools/statusline/bench/render.ts 100`. It reports
p50/p95 render wall time, process CPU time, and per-source wall time. The injected sources avoid
host probes and cache writes; these figures describe renderer overhead, not live collector cost.

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

### Owner-published agx facts

The agx and fleet rows read `current-runs.json`, `workspace-verdicts.json`, and
`doctor.json` under the agx state directory. Run appends publish current rows and
session counts; `ws gc` and successful workspace creation/removal publish verdicts;
`agx doctor` publishes complete findings. Rendering never starts a refresh for
these rows. Missing observations remain unknown and older observations retain
their values. An idle file does not become stale just because time has passed:
`current-runs.json` is stale only when its mtime precedes `records.jsonl`;
`doctor.json` is stale only when it precedes the newer of `records.jsonl` and
`workspace-verdicts.json`. A failed watch-mode read retains the last owner value
and shows its original age. `agx-doctor.path` triggers a debounced singleton
refresh after either diagnostic input changes.

`ws N here · M all` selects the current repository from the workspace owner's
inventory and labels the fleet total. Counts cover the existing GC inventory,
excluding workspaces already collected. A partial first observation shows the
repository count with an unknown fleet total until a complete fleet GC succeeds.
