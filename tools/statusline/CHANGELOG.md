# Changelog

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
