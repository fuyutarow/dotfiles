# agx-ws

State uses non-empty `AGX_STATE_DIR`, otherwise non-empty `XDG_STATE_HOME` plus
`/agx`, otherwise `~/.local/state/agx`. The legacy ledger is read-only at
`<state dir>/legacy-v1/` and has no separate environment variable.

Startup refuses retired state configuration with exit 2 and migration guidance.
It never moves data automatically.

See [tools architecture](../spec/architecture.md).
