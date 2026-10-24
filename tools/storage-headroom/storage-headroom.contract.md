# Storage-headroom low-storage contract

When a configured drive is below its deny line, ordinary commands that may write are
denied. The gate keeps cleanup, inspection, and bounded recovery commands available so
the operator can diagnose and recover from low storage.

The agx recovery exemption follows the released worker grammar and covers only these
commands:

- `agx worker run <ticket> [options]`
- `agx worker check <ticket> [options]`
- `agx worker ls [options]`
- `agx worker judge <run> accept|reject [options]`
- `agx worker stats [options]`

The exemption is limited to these verbs under `agx worker`; top-level legacy spellings,
unknown worker verbs, and compound commands that also run a non-exempt command remain
subject to the low-storage gate. `agx worker dispatch` is not included in this allowlist.
