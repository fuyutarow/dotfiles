# Effects and recovery — C2

Write effects before safety-flag names.

A contract table names every relevant read, write, network operation, and retained partial state.

| If the command… | The effects/recovery table must name |
|---|---|
| previews work | suppressed effects and forecast fidelity conditions |
| accepts force | the exact protection bypassed and acknowledgement strength |
| processes many items | continuation rule, aggregation rule, and per-item reporting |
| leaves partial state | retained/cleaned state, inspection path, and replay precondition |
| may wait or be interrupted | cancellation boundary, cleanup bound, and retry safety |

`dry-run` and `force` do not establish safety by name.

Do not claim atomicity or idempotence without command-specific preconditions.

Route reversibility and interlocks to `designing-interactions`.

This reference allocates only observable command effects and recovery.

CLI-010 supports explicit continuation and aggregation.

CLI-011 supports command-specific preview fidelity and force protection.

CLI-012 separates partial state, replay preconditions, and cleanup from universal transaction claims.

Grades and limits are in the forge ledger.

