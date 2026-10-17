# agx process interfaces

The `agx` command is the supported process interface for other repositories. Its implementation
files are internal and may move.

## Jev

Send one JSON request on stdin with the request shape accepted by the internal Jev client:

```sh
printf '%s\n' '{"state":{"task":"..."},"questions":{"worker":{}}}' | agx jev
```

`agx jev` posts to the configured Jev endpoint and prints the answer JSON on stdout. It exits 0
for an HTTP 200 JSON answer. Endpoint, credentials, and timeout follow the dispatch router:
`AGX_NEXT_JEV_URL` overrides the roster endpoint, and the key uses the shared TypeSafe resolver.
An unavailable transport, non-200 response, or invalid JSON answer exits non-zero with a one-line
reason on stderr.

## Dispatch roster

```sh
agx roster --json
```

This prints the parsed and validated dispatch roster as JSON. Its shape is the `value` returned by
the internal `loadRoster` function; callers should consume this process output instead of importing
repository source files.

## Durable dispatch

```sh
agx dispatch .agents/tickets/foo-bar.md [--ws other] [--unit agt_other-2] [--sandbox workspace-write] [--continue RUN_ID]
```

Dispatch defaults to the ticket's `name` (or its filename without `.md`): `ws_<name>` and
`agt_<name>`. `--ws` overrides the workspace slug passed to `ws add`; `--unit` overrides the
systemd service name. The repository comes from the ticket's location, independently of the caller's
working directory. Dispatch consumes `ws add --json` so readiness output cannot become a path.
Dispatch creates or reuses the workspace, refuses an active unit, verifies
the ticket and workspace resolve to the same repository default workspace, then starts the unit.
It waits for a run record containing its binding and prints the run id. It exits non-zero when the
unit cannot start or the record does not appear.
