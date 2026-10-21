# Codex remote-control upgrade safety boundary — 2026-10-21

## Outcome

**Resolved in source; active server remains owner-controlled.** The remote-control
converger now refuses an unmanaged app server before invoking a daemon mutation.
It returns a nonzero, actionable result instead of changing only the managed
daemon's future setting and reporting a false convergence. No app-server
process, session, or home configuration was stopped, restarted, adopted, or
written during this investigation.

Reader: dotfiles coordinator and machine owner. Register: internal technical
evidence. Terms: a *managed daemon* is an app server owned by `codex app-server
daemon`; an *unmanaged app server* is a separately launched `codex app-server`
process that the daemon does not own.

## Scoped observations

| Observation | Receipt | Limit |
| --- | --- | --- |
| Declared remote control is enabled. | `agents/codex/app-server.toml` sets `remote_control = true`. | Declaration does not establish the active direct server's flags. |
| The installed CLI is `codex-cli 0.163.0`. | Read-only `codex --version`. | It is a local runtime observation, not a release-history claim. |
| The daemon CLI says enable/disable affects future starts and a currently running managed daemon. | Read-only `codex app-server daemon --help`. | It makes no claim about a separately launched server. |
| The read-only source-state query returned persisted `false`, managed `running: null`, and `unmanaged: true`. | `readLive()` and `drift()` from `agents/codex/remote-control.ts`. | The direct server's remote-control flag is intentionally unknown. |
| `codex app-server daemon version` reported a running controller, CLI `0.163.0`, and app-server `0.162.1`; its managed version field was null. | Read-only CLI JSON. | It does not authorize restarting or replacing either server. |

## Cause and correction

`readLive()` already identifies an unmanaged direct app server when no managed
PID is present. Before this change, `drift()` omitted that state, and
`codex-remote-control.ts` ignored it: when persisted state differed from the
declaration, it could run `enable-remote-control`, then re-read only the
managed setting and print `converged`. That changes a future managed-daemon
setting but cannot change the active unmanaged server.

The correction makes unmanaged ownership a retained drift line and places an
explicit guard before the enable/disable command. The guard exits 1 with the
detected drift and recovery boundary. It performs no daemon command and does
not treat a managed-daemon setting as evidence about the active direct server.

## Owner action boundary

The remaining condition requires an owner-selected session boundary, not
automation. When the owning desktop or SSH session is no longer in use, the
owner can replace the direct app server with a managed daemon and then run
`mise run codex:remote-control`. That later command can synchronize the
managed daemon to the declaration. Until replacement, the active server's
remote-control state remains unknown and is reported as unresolved.

## Verification and release decision

The intended verification is a scoped TypeScript check of the two changed
modules plus `rumdl check` and non-empty-file validation for this evidence
artifact. No tests were added or run, and no full repository gate was run.

No release changeset or CHANGELOG entry is needed: this changes the dotfiles
configuration converger's safety behavior, not a released tool package.

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
