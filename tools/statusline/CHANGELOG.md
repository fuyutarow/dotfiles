# Changelog

## 0.22.7 — 2026-10-31

- Show Claude context usage against the saved per-model auto-compact window.

## 0.22.6 — 2026-10-29

- Recover interrupted sampler locks using a kernel lock; during the one-time rollout an old sampler can overlap until it exits.

## 0.22.5 — 2026-10-29

- Recover stale sampler locks after interrupted runs on macOS.

## 0.22.4 — 2026-10-29

- Show late worker counts only from recorded metadata on currently running runs.

## 0.22.3 — 2026-10-29

- Discover live sessions on macOS and record discovery failures.

## 0.22.2 — 2026-10-26

- Wrap statusline segments through Sys at terminal width

## 0.22.1 — 2026-10-24

- Find Codex credit baselines across 24 hours in bounded rollout scans and render zero changes as ±0

## 0.22.0 — 2026-10-24

- Show Codex credit balance and signed 24-hour change from bounded rollout history

## 0.21.11 — 2026-10-24

- Remove unused synchronous collectors and recovery entrypoint

## 0.21.10 — 2026-10-24

- Read Jev seven-day spend from the pinned agx public usage statistics

## 0.21.9 — 2026-10-24

- Project the routing warning from public agx routing statistics and hide unknown capability.

## 0.21.8 — 2026-10-24

- Read Jev roster prices through the public agx worker roster command

## 0.21.7 — 2026-10-24

- Read worker progress and state from released C2 listing fields

## 0.21.6 — 2026-10-24

- Consume released agx doctor findings through status JSON

## 0.21.5 — 2026-10-23

- Resolve the agx status collector through the dotfiles mise pin.

## 0.21.4 — 2026-10-23

- Resolve Jev roster through the dotfiles mise pin from any working directory.

## 0.21.3 — 2026-10-23

- Resolve Jev roster prices from agx-worker on PATH instead of dotfiles sources.

## 0.21.2 — 2026-10-23

- Resolve worker progress from the configured agx state directory

## 0.21.1 — 2026-10-23

- Replace project-specific fixture names and allow an operator-configured sampler repository.

## 0.21.0 — 2026-10-23

- Collect agx status JSON in the sampler and render run, workspace, finding and judgment rows from the owner cache.

## 0.20.18 — 2026-10-23

- Read Jev prices from the agx-worker roster CLI

## 0.20.17 — 2026-10-21

- Render unreported worker costs with an explicit reason

## 0.20.16 — 2026-10-21

- Preserve resolved worker scope and reject reused prepared-view PIDs

## 0.20.15 — 2026-10-21

- Watch worker rows now identify their dispatcher session and stale run snapshots immediately.

## 0.20.14 — 2026-10-20

- Compose same-session Claude limits into published snapshots

## 0.20.13 — 2026-10-20

- Declare session input provenance, reject mismatched sampled facts, require exact Codex identity, and distinguish redraws from sample freshness.

## 0.20.12 — 2026-10-19

- Show recorded GPU stalls and failed probes with a JST timestamp and gpu-sampler --check; suppress alerts while paused.

## 0.20.11 — 2026-10-19

- Write Codex rollout identity to fleet sessions

## 0.20.10 — 2026-10-19

- Bound async statusline children by the render deadline and align Herdr tests with fleet-session ownership

## 0.20.9 — 2026-10-19

- Write resolved Claude session names to fleet handoffs

## 0.20.8 — 2026-10-19

- Write Claude and Codex statusline session handoffs for fleet consumers

## 0.20.7 — 2026-10-19

- Scope judge to the last 24 hours in the rendered session or repository and land to existing unlanded workspaces in this repository

## 0.20.6 — 2026-10-19

- Fix --watch --thread and standalone --thread to render and refresh the selected Codex thread; diagnose unknown IDs and conflicting selectors.

## 0.20.5 — 2026-10-19

- Show GPU stalls on Sys and only actionable dispatch items on the optional bottom row

## 0.20.4 — 2026-10-18

- Keep Claude and Codex sidebar identity tokens tied to their own session events

## 0.20.3 — 2026-10-18

- Require reasons for unavailable values and render Stop snapshots from the statusline formatter and sampled session frames.

## 0.20.2 — 2026-10-18

- Render one location, one row per session and shared host facts once; retain sampler values across project state overrides and keep renders under 100 ms.

## 0.20.1 — 2026-10-17

- Report Codex pane names with their project and source model and effort from the exact Codex session; preserve Claude sidebar behavior.

## 0.20.0 — 2026-10-17

- Move collectors to timer-owned state; render without processes or cache writes, fix cached context tokens and jj workspace/version display, and derive agx freshness from input mtimes.

## 0.19.3 — 2026-10-17

- Standardize -V/--version, plain deterministic help, and typed unknown-flag diagnostics.

## 0.19.2 — 2026-10-17

- Read fresh GPU owner state without launching driver probes.

## 0.19.1 — 2026-10-17

- Discover live Claude and Codex sessions from processes and open rollout descriptors without scanning the session store.

## 0.19.0 — 2026-10-17

- Read owner-published run, workspace and doctor snapshots without refreshing during rendering; scope workspace counts to the current repository and fleet.

## 0.18.0 — 2026-10-17

- Discover live Claude Code and Codex sessions from the current directory

## 0.17.1 — 2026-10-17

- Count running workers from the current session and show other-session workers only on the fleet line.

## 0.17.0 — 2026-10-17

- Add a cached fleet summary for running workers, lost runs, and workspace classifier counts; retain stale values and refresh at most once per minute.
- Show cached agx doctor findings by kind, show ok only after a clean observation, and prefix worker-row tickets with tkt_.

## 0.16.7 — 2026-10-17

- Fix empty agx summary fields, hide worker session IDs, normalize agt_ names, and count doctor-classified orphaned runs.

## 0.16.6 — 2026-10-17

- Render agx summary as one line and count folded lost runs

## 0.16.5 — 2026-10-16

- Retain every statusline field across read failures and timeouts with persisted last-good values and visible ages.

## 0.16.4 — 2026-10-16

- Make statusline tests independent of user state, wall clocks and host scheduling by isolating homes and injecting deadline clocks.

## 0.16.3 — 2026-10-16

- Display recent unacknowledged ended lost runs as lost counts

## 0.16.2 — 2026-10-16

- Display worker and workspace names in run rows

## 0.16.1 — 2026-10-16

- Reuse the shared Codex account usage reader so empty sessions cannot erase weekly usage

## 0.16.0 — 2026-10-16

- Show bounded tmpfs byte and inode headroom on the Sys line using storage-headroom warning and denial thresholds.

## 0.15.4 — 2026-10-16

- Show failed recover services and flag stalled reclaim runs

## 0.15.3 — 2026-10-15

- Publish the statusline's existing Claude and Codex quota readings for agx routing

## 0.15.2 — 2026-10-15

- Read agx rows from one last-good snapshot refreshed by a detached worker; retain prior rows after slow or failed refreshes and mark their age after 30 seconds.

## 0.15.1 — 2026-10-12

- Recover stale per-session render locks before considering cached output; only reuse a frame younger than five seconds while a live owner renders the same input, and persist its render time and input.

## 0.15.0 — 2026-10-12

- Select this session's agx runs using the same dispatcher-session environment precedence as `agx ps --mine`, and summarize live named runs in `Job:` so detached systemd runs are visible there too.

## 0.14.2 — 2026-10-12

- Serialize same-session renders across processes and reuse the last output for concurrent calls, including Codex live frames.
- Cache git, agx process/dispatch scans, disk readings and rates, and Codex rollout selection on disk with short TTLs; keep the existing host-wide GPU sample cache.
- Reread selected Codex metadata, streamed settings and context on every call so appends and replacements remain visible within the selection TTL.
- Return absent Codex rates immediately when the sessions directory is missing, avoiding a year of failed day lookups competing with cache I/O.

## 0.14.1 — 2026-10-12

- Stream current Codex thread settings and turn metadata across the full rollout with bounded memory, preserving cold-process and later model/effort changes. Validate cached prefixes before incremental append reads and keep the context tail bounded.
- Retry exact-thread Herdr metadata reporting on PostToolUse through the canonical hook registry, deduplicating unchanged reports briefly.

## 0.14.0 — 2026-10-11

- Refresh Codex status in place every five seconds on a TTY; add `--once`, `--watch` and validated `--interval` controls with clean terminal restoration.
- Pin a live display to its initially selected Codex session so newer rollouts in the same cwd cannot take over.

## 0.13.0 — 2026-10-11

- Make `statusline --codex` default to the current directory, select only interactive `codex-tui` rollouts, and support exact `--thread <id>` selection with a non-zero unknown-id result.
- Omit Claude-only identity, rate-window, diff and cost fields from Codex output, and document the CLI defaults in help.

## 0.12.0 — 2026-10-11

- Show `ccc indexing Nm` in the Sys GPU segment after 15 minutes of observed GPU indexing; reuse the sampler with bounded probes cached for one minute. Retire the per-prompt and per-Bash advisory hook.

## 0.11.0 — 2026-10-11

- Add a Codex rollout adapter for model, effort, context, and rate-window status.
- Add `statusline --codex --cwd <dir>` and `--pid <pid>` for tmux's active Codex pane.
- Show the full statusline output in tmux's status bar, refreshed on the existing five-second interval.

## 0.10.2 — 2026-10-10

- Color Claude and Codex rate usage by used-to-elapsed pace: green through 1.0, yellow through 1.5, and red above 1.5 or at 90% usage; keep the first 2% of a window on usage-threshold colors unless usage is already high.
- Color disk free GiB by the free percentage on every volume: red below 10%, yellow below 20%, and green otherwise.
- Cover the owner's screenshot values and pace/disk color boundaries.

## 0.10.1 — 2026-10-10

- Read the shared forward-compatible progress-sidecar contract, including `turns`, so working rows retain the latest command, counts and rollout-derived cost when writers add fields.
- Guard row rendering with real-shaped progress and Codex rollout fixtures, including an unknown future progress field.

## 0.10.0 — 2026-10-10

- Move render-path file reads, GPU lock probing and snapshot cache writes onto asynchronous APIs so Promise.all collectors overlap filesystem I/O without changing rendered rows.

## 0.9.9 — 2026-10-10

- Share label, window, value, secondary and separator roles across every Rate and Sys segment, including explicit n/a values.
- Color Jev seven-day spend green below $1, yellow from $1 to below $5, and red at $5 or above; keep `spend` dim and the source/window plain.
- Dim disk capacity, free percentage and rate suffixes, plus memory stale details; only disk free GiB carries the space threshold color.

## 0.9.8 — 2026-10-10

- Read the recent dispatch-warning window from a bounded tail of `runs.jsonl`.

## 0.9.7 — 2026-10-10

- Show every disk as free/total GiB with its rounded free percentage; colour only the free amount using the existing space thresholds, preserving the depletion-rate suffix.
- Show known free space without a fraction when capacity is unknown, and explicit n/a when free space is unknown.

## 0.9.6 — 2026-10-10

- Always render the fixed Claude, Codex and Jev Rate slots, with named n/a for missing, empty, stale, invalid, unreadable or timed-out sources.
- Keep rate file reads asynchronous so slow storage cannot block source deadlines.

## 0.9.5 — 2026-10-10

- Keep phase, final vendor session and final cost visible from the marker while agx verifies and grades after worker exit.

## 0.9.4 — 2026-10-10

- Show run-row and Jev spend costs through the shared cents formatter, including `<$0.01` for positive sub-cent spend.

## 0.9.3 — 2026-10-10

- Read the shared agx marker contract, render every own live worker including resumed runs, and show unreadable-marker counts while skipping malformed markers without identity.

## 0.9.2 — 2026-10-10

- Use the shared jittered GPU sampler and show its 15-minute utilization estimate and sample count beside VRAM when enough history exists. Preserve sampling outside the render path.

## 0.9.1 — 2026-10-10

- Render other-session, unattributed, and stale run counts together on one dim-separated summary line.

## 0.9.0 — 2026-10-10

- Attribute live workers only by the statusline payload's session id; show missing dispatcher sessions as dim `unattributed N` and dead markers as `stale N`.
- Read both agx and legacy agent-router markers during migration, deduplicating by run id with agx taking precedence and reading progress beside its marker. State paths now have one shared home.

## 0.8.0 — 2026-10-09

- Show free disk space in GiB and a smoothed fill/free rate from atomically persisted samples, after at least 30 seconds.
- Colour filling rates by time to full using the canonical storage thresholds; gate enforcement remains unchanged.

## 0.7.3 — 2026-10-09

- Dim Jev's seven-day spend detail like the Rate-line reset text.

## 0.7.2 — 2026-10-09

- Match Jev provider and spend coloring to the existing Rate-line styles.

## 0.7.1 — 2026-10-09

- Label Jev's computed seven-day spend and keep unknown agent costs visible as `$–`.

## 0.7.0 — 2026-10-09

- Show seven-day Jev spend using roster prices and lower the shared cost display floor to $0.01.

## 0.6.1 — 2026-10-09

- Render known costs below $0.10 as `<$0.1`and zero as`$0`.

## 0.6.0 — 2026-10-09

- Show live Codex worker cost from the session rollout when progress usage is not yet available.

## 0.5.0 — 2026-10-09

- Show known per-worker dispatch cost after elapsed time, formatting small amounts to two significant digits and larger amounts to one decimal.

## 0.4.0

- Group Claude windows under `claude`, show Codex elapsed window shares, and replace Codex credits with seven-day Jev token usage when the router log is available.

## 0.3.0

- Show Codex usage windows and credits from the newest session rollout, with stale age and bounded reads.

## 0.2.7

- Keep parity fixtures portable across machine hostnames after the alpha rebase.

## 0.2.6

- Build statusline data from concurrent, budgeted async sources; timed-out readings render named unknown placeholders and herdr reporting no longer gates the line.

## 0.2.5

- Make prompt and entry parity fixtures independent of the test host's hostname and GPU tooling.

## 0.2.4

- Separate each rate window's reset countdown and elapsed share with a space.

## 0.2.3

- Show each rate window's elapsed share inside its reset countdown, and highlight usage that is more than 10 points ahead of elapsed time.

## 0.2.2

- Remove the redundant resume glyph from dispatch rows and keep ASCII session ids aligned; shared prefixes now participate in collision expansion regardless of resume state.

## 0.2.1

- Retarget the `s` alias to the package-owned host-load entry and retire the legacy helper copies.
- Refresh comments and package documentation after the former Claude statusline was removed.

## 0.2.0

- Re-sync with the pre-port statusline at alpha cbc82bdc: the codex-share warning row (`src/dispatch-warning.ts`, read-only) and the head/tail session ids now follow the original rules exactly (short and empty ids, resume mark counted in collisions).
- `statusLine.command` is declared as `~/.bun/bin/statusline`; the root `package.json` `bin` carries `statusline`.

## 0.1.1

- Show worker session ids as collision-resistant head/tail pairs and mark resumed runs.

## 0.1.0

- Port the Claude statusline into a package-owned CLI with local modules and read-only dispatch state parsing. No live harness cutover.
