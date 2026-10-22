# agx-worker

Dispatch, inspect and judge worker runs. Invoke it directly or through `agx worker`.

The append-only records and their format remain at `$XDG_STATE_HOME/agx-next/records.jsonl`
(default `~/.local/state/agx-next/records.jsonl`). Judgments remain available to audit and
statistics views; local run outcomes and grades do not enter model selection criteria.
`agx-next` is the legacy state-directory name; there is no `agx-next` command. `agx-run` is removed.

[Scope and ownership](docs/scope.md) · [Suite architecture](../spec/architecture.md) · [Caller inventory](docs/suite-callers.md)

[acpx replacement decision](docs/acpx-boundary.md) records the executed hook, sandbox and
capacity comparison, including the code that could be replaced and the integration that remains.

## Dispatch roster

`agx-worker roster TICKET.md` prints the one selected roster row as JSON using the same routing
filter as a run, without starting a worker. Legacy `roster --json` still prints the full validated roster.

```sh
agx-worker roster --json
```

This prints the parsed and validated dispatch roster as JSON. Its shape is the `value` returned by
the internal `loadRoster` function; callers should consume this process output instead of importing
repository source files.

## Durable dispatch

```sh
agx-worker dispatch .agents/tickets/foo-bar.md [--ws other] [--unit agt_other-2] [--sandbox workspace-write] [--continue RUN_ID]
```

Dispatch defaults to the ticket's `name` (or its filename without `.md`): `ws_<name>` and
`agt_<name>`. `--ws` overrides the workspace slug passed to `agx ws add`; `--unit` overrides the
systemd service name. The repository comes from the ticket's location, independently of the caller's
working directory. Dispatch consumes `agx ws add --json` so readiness output cannot become a path.
Dispatch creates or reuses the workspace, refuses an active unit, verifies
the ticket and workspace resolve to the same repository default workspace, then starts the unit.
It waits for a run record containing its binding and prints the run id. It exits non-zero when the
unit cannot start or the record does not appear.

## Doctor

`agx-worker doctor` diagnoses worker records only. Each finding is one JSON line with
`tool`, `object` (repository and run id), `finding`, and `remedy`. Exit 0 means clean, 1 means
findings, and 2 means incomplete diagnostics or usage failure. `scripts/agx-doctor.ts` composes
this output with `agx ws doctor` and `agx ticket doctor`; composition is outside the suite dispatcher.
