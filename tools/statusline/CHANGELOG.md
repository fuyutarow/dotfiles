# Changelog

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

- Render known costs below $0.10 as `<$0.1` and zero as `$0`.

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
