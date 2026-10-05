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

## Liveness and outcome honesty

A human caller cannot tell slow from hung, or a fallback from success, unless the command says so.
Fill one row per external wait, fallback, and handed-off effect.

| Situation | Contract requirement | Failure it prevents |
|---|---|---|
| Human mode waits on a child, socket, network, or lock | Bound the wait. Past the response-time window, say on stderr what is awaited. Put the elapsed time in the result line. | A merely slow step reads as a hang. |
| The intended target is unavailable and another is used | Make the switch an outcome row. Either state it with the reason, or refuse and name the override. | A result lands where nobody looks. |
| A dependency's exit status cannot show success | Classify as handed off or unknown, never success. Bound it and report expiry. | Exit 0 after nothing happened. |
| A warning would fire on the normal path | Set its threshold above normal variation. | Routine noise hides real anomalies. |

The response-time windows are owned by `designing-interactions`, `references/reversibility.md` §5.
Silence is correct only for a fast default path that the contract documents.
Machine mode keeps payload framing; liveness goes to documented stderr or is omitted.

Local evidence: `tests/local-failure-corpus.md`, smart-open rows (2026-10).

CLI-004 treats stdout, stderr, and exit status as distinct observable channels.

CLI-005 and CLI-006 support a stable machine route and its framing/configuration dimensions.

CLI-007 supports noninteractive and TTY-gated presentation.

CLI-008 and CLI-009 keep recovery-relevant outcomes distinct from complete diagnosis.

Grades and limits are in the forge ledger.

