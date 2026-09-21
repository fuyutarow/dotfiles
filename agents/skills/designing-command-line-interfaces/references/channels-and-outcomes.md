# Channels and outcomes — C3/C4

## Channel/mode matrix

| Mode | stdout | stderr | Contract addition |
|---|---|---|---|
| human interactive | result payload or summary | diagnostics/progress | TTY and decoration policy |
| noninteractive human | documented result | diagnostics | no prompt-dependent completion path |
| machine | framed payload only | diagnostics | encoding, framing/schema, and compatibility promise |

A machine format label alone is insufficient.

Name framing, decoration/config independence, schema or field behavior, and compatibility.

Do not require JSON universally.

## Outcome matrix

Create a class only when a caller's recovery differs.

Each row maps class → exit/status → output → retry or next action.

Numeric exit codes are product-specific unless a declared target standard fixes them.

A detailed cause belongs in a diagnostic or structured error envelope.

One failure's wording, locus, and recovery card belongs to `designing-developer-diagnostics`.

CLI-004 treats stdout, stderr, and exit status as distinct observable channels.

CLI-005 and CLI-006 support a stable machine route and its framing/configuration dimensions.

CLI-007 supports noninteractive and TTY-gated presentation.

CLI-008 and CLI-009 keep recovery-relevant outcomes distinct from complete diagnosis.

Grades and limits are in the forge ledger.

