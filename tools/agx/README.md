# agx

A PATH dispatcher for three tools:

- `agx worker ARGS` → `agx-worker ARGS`
- `agx ticket ARGS` → `agx-ticket ARGS`
- `agx ws ARGS` → `agx-ws ARGS`

Arguments and child exit status pass through. `agx -V` prints the suite version only.
`agx -h` takes each tool’s one-line description from its own PATH help.

The static transition table forwards `run`, `dispatch`, `check`, `ls`, `judge`,
`stats`, `roster`, `doctor`, and deprecated `jev` to the worker, emitting one stderr
line naming `agx worker <verb>`. `agx doctor` diagnoses workers only.
The machine diagnostic composition lives in `scripts/agx-doctor.ts`, invoked by the systemd unit.

See [worker interfaces](../agx-worker/README.md) for dispatch, roster and deprecated Jev use,
and the [caller inventory](../agx-worker/docs/suite-callers.md) for the migration search.
