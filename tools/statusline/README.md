# statusline

Part of the [tools/ architecture](../spec/architecture.md) (report: invariant I-R3).

Package-owned statusline, ported from the former Claude implementation. The first row ends
with the version imported from `package.json`.
`agents/claude/settings.json` declares `statusLine.command` as `~/.bun/bin/statusline --session stdin`, this package's `bin`
(root `package.json` `bin`, installed by `bun link` / `mise run deps`). The former Claude implementation
has been retired; parity fixtures preserve its expected behavior.

Run with Bun 1.4 or newer:

```sh
printf '%s' '{}' | bun tools/statusline/src/statusline.ts
statusline
statusline sessions --cwd . --json
statusline payload <session-id>
CODEX_SESSION_ID=<session-id> statusline --codex --cwd "$HOME/dotfiles"
statusline --codex --thread 01a1291d-5a63-76d3-a760-021ebaabf5f2
statusline --codex
bun test tools/statusline/tests
```

## Unavailable values and Stop snapshots

Unavailable fields use the shared `Unavailable` type, with a required reason. Its only text
renderer emits `n/a (<why>)`; the ANSI layer styles that text. Snapshot caches containing
legacy bare `n/a` are rejected until the sampler replaces them.

The sampler publishes Stop's Ctx, Rate, and Sys rows through `render(..., { layout: "snapshot" })`,
using the same session frames as the statusline presentation. The hook only reads those rows;
it does not format metrics or append a separate GPU observation.

The 2026-10-18 09:17 JST report exposed two causes. Claude's statusline stdin supplies
`context_window.used_percentage` and `rate_limits`; transcript reconstruction supplies usage
token counts but neither of those fields. The snapshot publisher reconstructed that poorer
input separately. The unavailable renderer then suppressed its default reason, producing bare
`n/a`. Reusing the sampled frames removes that reconstruction; transcript-only inputs still
explain missing fields rather than inventing a percentage or rate.

## Codex display contract

| Invocation                                              | Behavior                                                                                                             |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `statusline --codex` on a TTY                           | Live in-place refresh every 5 seconds; `q` or Ctrl+C exits.                                                          |
| `statusline --codex` without a TTY                      | One snapshot, preserving the existing output bytes.                                                                  |
| `statusline --codex --once`                             | One snapshot with a trailing newline.                                                                                |
| `statusline --codex --watch [--interval N]`             | Explicit live display; `--watch` requires TTY stdout. Interval is finite 1–3600 seconds and only valid in live mode. |
| `--watch --once`, or Codex-only flags without `--codex` | Usage error (exit 2).                                                                                                |

Live mode selects an exact thread, then rereads that session ID on every frame. It never switches to a newer same-directory session. The display uses the alternate screen and hides the cursor while active, then restores terminal state on exit or signal. Its footer describes display redraw frequency; sampler observation ages are independent.

The Claude adapter parses Claude Code statusline JSON on stdin and normalizes it to the provider-neutral
`SessionStatus` contract; stdout retains the existing ANSI rows and graceful invalid-input messages.
With empty stdin or a terminal, `statusline` discovers live Claude Code and Codex processes in the
current directory and renders one location line, one line per session, then shared Rate, Sys,
Job, agx and worker lines once. `--session ID` selects one live session; `--session stdin`
uses Claude's supplied session payload. `statusline sessions --cwd DIR
--json` emits one JSON record per session; `statusline payload SESSION_ID` emits the renderer
payload for that live session. When no session is present, host and
dispatch rows still render with `no agent session in <cwd>`. `--watch [SECONDS]` redraws discovered
sessions in place (default five seconds); `--interval N` remains an equivalent interval option
(1–3600 seconds). Non-empty piped payloads
use the same location/session/shared layout.
On Linux, `statusline-sampler.timer` owns collection and refreshes five seconds after
each completed sample. It publishes `~/.local/state/statusline/owner.json`
with separate observation timestamps. Host status deliberately ignores project-local
`XDG_STATE_HOME` overrides; explicit `STATUSLINE_OWNER_STATE` redirects isolated probes. A failed
collection retains the last successful value and its timestamp. The systemd service
and its runtime lock prevent overlapping samples. GPU observations still come from
the separate GPU owner.

The sampler also publishes `owner.json.view`, using the same renderer, and atomic last-good
copies of both files. Normal empty-stdin renders read that prepared display and selected
PIDs, update its clock, and show an age when sampling stops or the main file is unreadable.
This removes cold dependency initialization and whole-rollout settings scans from each render.
The sampler runs `agx status --json --cwd DIR` once per sampled directory and stores its
schema-1 JSON in the existing owner file. The adapter preserves agx run, workspace,
finding and judgment counts; failed collection retains the prior value as stale.
The legacy enriched progress reader still resolves agx state until its separate
`agx worker ls --json` / `last_progress_path` migration.
On first use, the full renderer reads the owner file, transcripts and the selected
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
TUI. `--codex` requires `CODEX_SESSION_ID` unless `--thread` supplies the exact identity;
`--cwd` constrains that identity to the supplied directory and `--pid` reads that constraint
through `/proc`. Neither cwd nor PID alone selects a session. `--thread` selects the
rollout whose filename ends in the supplied thread ID. `--thread` implies `--codex`:
`statusline --watch --thread <id>` and `statusline --thread <id>` refresh that thread in a terminal
until interrupted; `--once` or redirected stdout renders one snapshot. Explicit `--watch` requires
a terminal on stdout. A thread cannot be combined with `--cwd`, `--pid`, `--session`, `--json`,
or a subcommand; invalid combinations exit 2 with a diagnostic. Exact thread selection accepts
`codex-tui` and `Codex Desktop` rollouts, skipping `codex_exec` workers. A snapshot selection with no match prints one dim line and exits; live
`--watch` keeps polling until it finds a session. Codex
output omits Claude-only identity, rate-window, diff and cost fields. An unknown thread ID prints
one error line naming that ID and exits non-zero. The adapter reads bounded
metadata and event tails, normalizes them to `SessionStatus`, and leaves missing Codex context or
rate data as explicit n/a slots. tmux checks `pane_current_command`, supplies the active pane cwd,
and refreshes through its existing five-second `status-interval`. Herdr's command entries are
tab-bar-wide; its pane metadata is display-only, so neither provides tmux's active-pane command
format.

### Session source evidence (2026-10-19)

Standalone output is a cwd-scoped inventory, not the selected Codex TUI's context. Each session
line declares `Codex (transcript)`, `Claude (transcript)`, or `Claude (stdin)` and ends with its
own Session ID. `--session ID` renders only that identity. Sampler session facts are accepted
only when session ID, cwd, vendor and transcript path agree with the selected inventory entry;
legacy or mismatched facts are reread from that exact transcript. Prepared displays from the
older unlabeled protocol are rejected until the sampler republishes them.

Read-only inspection of `~/.local/state/statusline/owner.json` confirmed the reported sessions:

- Codex `01a15424-5f6d-7ce0-9244-eb632a37f579` reads
  `~/.codex/sessions/2026/10/19/rollout-2026-10-19T21-30-32-01a15424-5f6d-7ce0-9244-eb632a37f579.jsonl`
  (`session_meta.originator: Codex Desktop`). Its sampled model/effort were GPT-6.1-Sol/medium.
- Claude `47cecd33-9bd9-42b8-be16-8f17bb0bae76` reads
  `~/.claude/projects/-home-fuyu-dotfiles/47cecd33-9bd9-42b8-be16-8f17bb0bae76.jsonl`.
  Its sampled model was Opus 5.5 and context was 678,354 tokens. Both inventory entries had
  cwd `~/dotfiles`; the different rows were deliberate separate sessions, not evidence of
  a Codex payload being replaced by Claude.

The Claude transcript reconstruction supplies usage counts but no effort, percentage or rate
limits. This concretely accounts for the reported missing effort/workflow/context-percent/rate
inputs; the renderer must not infer them from the neighboring Codex row. Agent name comes from
the sampler's `name:<Claude ID>` observation; RC comes from its separate `rcState` observation.
Shared Rate slots have independent owners: Claude windows come from the Claude frame's input
(absent in transcript reconstruction), model caps from sampled Claude account identity,
Codex from `fields.codexRate`, and Jev from `fields.jevUsage`. No first-Codex-session rate
lookup is performed by standalone rendering. A redraw every five seconds can display samples
59 seconds old because `owner.json.view` is produced independently by the sampler.

Dispatch worker rows show the roster row, elapsed time, cost, worker/workspace name and ticket.
Session IDs remain in the data and are omitted from worker rows. Legacy `agx-<slug>` worker names
display as `agt_<slug>`. The bottom row is optional: it lists pending judgments from this session (`judge N (agx worker judge)`), accepted runs with an unlanded workspace verdict (`land N (mise run land)`), remedy-named doctor findings, and the running-worker count outside the exact selected dispatcher session or displayed session inventory. A selected watch session shows that session's workers; an unselected cwd inventory shows workers attributed to any displayed provider session. When the run cache is known to trail the state log, its age is shown immediately.

Storage still reads the canonical `agents/hooks/storage-headroom.toml` as runtime data, resolved
relative to this package rather than cwd. Only `storageLine` is imported from shared storage code.
Disk free GiB uses three significant figures. A fill/free rate appears at
0.05 GiB/min or more, with two significant figures and ↓/↑ arrows. The sampler atomically updates
`~/.local/state/statusline/disk-rate.json`.
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

The sampler runs the pinned `agx status --json --cwd DIR` and caches the
published CLI response. Rendering reads only that sampler cache. Agx owns refresh,
aggregation, private storage, and freshness; dotfiles does not read or write agx's
doctor files. `agx-doctor.service` runs `agx doctor --json` and accepts exits 0
(clean) and 1 (findings). The path trigger and debounce timing remain unchanged.

The shared `doctor-record.ts` adapter projects schema-1 findings from CLI JSON.
Unknown finding strings and additive fields are tolerated. Unsupported schemas
fail visibly. Missing findings remain unknown; incomplete findings are marked stale.
Workspace counts, completed-run judgments, and landing actions come from the
published status response, with repository/session scope supplied by agx.

Prepared standalone rows use repository scope even when agent sessions are discovered. Prepared views carry an action-scope protocol marker so historical counters cannot survive in an older cached view; a selected session rebuilds its own actions.

The anomaly suffix counts only workspace/ticket findings with clearing actions from
`agx worker doctor`, labeled with those commands (`agx ws refresh`, `agx ws gc …`, `agx ticket gc`, or
`mise run land`). Historical outside-home, unjudged, orphaned and legacy counters
remain available in `agx worker doctor`; they do not appear in that suffix.

When `gpu-owner.json` has `unresponsiveSince` or a failed probe (`consecutiveProbeMisses > 0`), the GPU segment on Sys shows `⚠ GPU stalled since HH:MM JST · gpu-sampler --check` instead of a utilization average. The timestamp is the recorded stall onset, or the failed attempt time when no onset is recorded, always in Asia/Tokyo. Paused probes add no warning. This only reads owner state; it never runs `nvidia-smi`. The sampler prepares this display for the normal fast read path. Source ages name the stale owner and never create a bottom row on their own.
