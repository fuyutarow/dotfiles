# Changelog

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
