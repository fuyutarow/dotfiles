# agx

A PATH dispatcher for five tools:

- `agx worker ARGS` → `agx-worker ARGS`
- `agx ticket ARGS` → `agx-ticket ARGS`
- `agx ws ARGS` → `agx-ws ARGS`
- `agx status ARGS` → `agx-status ARGS`
- `agx msg ARGS` → `agx-msg ARGS`

Arguments and child exit status pass through. `agx -V` prints the suite version only.
`agx -h` takes each tool’s one-line description from its own PATH help.

Only `worker`, `ticket`, `ws`, `status`, and `msg` are accepted as tools. An unknown tool exits 2
with one stderr line naming the five accepted tools and no stdout output.

See [worker interfaces](../agx-worker/README.md) for worker commands.

The suite forwards the environment unchanged. Its owner tools use non-empty
`AGX_STATE_DIR`, then `$XDG_STATE_HOME/agx`, then `~/.local/state/agx`.
The legacy ledger is read-only at `<state dir>/legacy-v1/`. Owner tools refuse
retired state configuration with exit 2 before running a command.
