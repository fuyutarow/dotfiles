# Codex update-provider evidence — 2026-10-21

## Scope

This receipt resolves the declared-provider update route after the owner reported
that Homebrew upgraded the WSL Codex cask from 0.162.1 to 0.163.0 and the next
declared-provider step printed `Could not detect Codex installation method`.
No updater, installer, daemon operation, or service lifecycle action was run to
collect this evidence.

## Source evidence

- `agents/codex/runtime.toml:2-5` declares `wsl = "standalone"`.
- `Brewfile.core:27-31` declares the WSL unqualified `codex` executable as the
  Homebrew `codex` cask. Its comment distinguishes it from macOS and ordinary
  Linux standalone installations.
- `topgrade/topgrade.toml:46` invokes `codex-update.ts` as a custom
  declared-provider step. Homebrew's own Cask step is therefore the WSL
  installation updater, not that custom script.

## Local runtime observations

- Calling `declaredProvider(process.cwd())` from `agents/codex/runtime.ts`
  returned `standalone`.
- `command -v codex` returned `/home/linuxbrew/.linuxbrew/bin/codex`.
- `codex --version` returned `codex-cli 0.163.0`.
- `brew list --cask codex` listed the 0.163.0 Caskroom receipt and executable.
- `codex update --help` identifies `codex update` as a self-update command. It
  was inspected only with `--help`; the mutating command was not run.

## Attribution and routing

`standalone` identifies the CLI runtime interface, not its installation owner.
On WSL, the source declaration and live executable make Homebrew the owner of
that standalone CLI's update. Invoking its self-updater immediately after
Topgrade's successful `brew_cask` update duplicates the installation action and
matches the owner's reported detection failure.

The patch scopes the Homebrew route to WSL only. The Windows Desktop branch
still skips standalone updates, while macOS and ordinary Linux retain
`codex update` for their separately declared standalone installations. A
Homebrew failure is still reported by Topgrade's `brew_cask` step; the custom
follow-up does not invoke a second updater whose result could obscure it.

## Patch, release, and deployment

Only `agents/codex/codex-update.ts` changes behavior: WSL logs that Homebrew
owns the update and does not call `codex update`. The daemon-version and remote
control reconciliation paths are otherwise untouched.

No tool release changeset is needed because this is a dotfiles agent script,
not a versioned package under `tools/`. Integration must place this patch in the
canonical dotfiles checkout before a later normal `mise run up`; this executor
did not deploy it or run any live update path.

## Combined scoped lint receipt

- Command: `mise run lint:ts -- agents/codex/codex-update.ts
  agents/codex/codex-remote-control.ts agents/codex/remote-control.ts`
- Exit status: 0.
- Result: the type-aware `oxlint` invocation completed for all three candidate
  modules; its prerequisite runtime, no-disable, and no-sync checks also passed.
- Bound: this is a static source check only. It did not run a Codex updater,
  installer, daemon command, remote-control enable/disable command, session
  action, or service lifecycle operation. It does not establish live provider,
  daemon ownership, or remote-control state.
