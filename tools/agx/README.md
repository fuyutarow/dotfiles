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
