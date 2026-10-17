# Changelog

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
