# CLI CONTRACT

## C0 CONSUMERS

- Consumer regimes: human-interactive, shell-pipeline, ci, agent

| Regime | Supported work | Noninteractive path | Machine-readable result |
|---|---|---|---|
| human-interactive | inspect local state | flags and stdin | JSON Lines result mode |
| shell-pipeline | consume selected records | stdin or operands | one JSON object per line |
| ci | check policy | no prompt | stable outcome and exit |
| agent | inspect and apply | explicit flags | framed JSON Lines v1 |

## C1 INVOCATION

- Parser profile: target parser rejects unknown flags and treats `--` as end of options.
- Ambiguous / invalid cases: repeated `--format` rejects; options after operands reject; a missing operand exits as usage failure.

| Synopsis / input | Ordering and repetition | stdin | Help / example |
|---|---|---|---|
| `tool inspect [--format jsonl] [--] PATH...` | one format flag; operands follow options | `-` reads records | `--help` writes usage to stdout and exits zero |

## C2 EFFECTS

- Effects / recovery: inspect reads local files only; apply writes selected records; dry-run predicts selected writes; force bypasses an existing-target guard; partial writes remain named; retry requires the same input snapshot; SIGINT stops future writes.

| Effect boundary | Preview / force | Partial state | Retry / cancellation |
|---|---|---|---|
| inspect is read-only; apply writes selected records | dry-run performs no writes; force bypasses only existing-target guard | completed records remain and are reported | retry only failed records; SIGINT stops before the next record |

## C3 CHANNELS

- Machine mode: jsonl
- Machine framing: one UTF-8 JSON object per line; no color or progress on stdout.
- Machine compatibility: `jsonl` v1 fields are additive-only; unknown fields may be ignored.

| Mode / TTY | stdout | stderr | Decoration / framing |
|---|---|---|---|
| human TTY | result summary | progress and diagnostics | color only when explicitly enabled |
| jsonl non-TTY | one JSON object per line | diagnostics only | UTF-8 JSON Lines v1; no color |

## C4 OUTCOMES

| Outcome class | Exit / status | Output | Retry / next action |
|---|---|---|---|
| success | exit 0 | result payload | none |
| usage failure | exit 2 | no payload | correct invocation |
| partial apply | exit 1 | completed and failed record IDs | retry failed IDs with same snapshot |
| interrupted | exit 130 | completed record IDs | inspect state before retry |

## C5 EVOLUTION

- Positive receipt: `tool inspect --format jsonl item` exits 0 and emits one JSON Lines v1 object.
- Negative receipt: `tool inspect --format yaml item` exits 2 with an unknown-format diagnostic on stderr.

| Surface | Promise | Change / deprecation | Verification receipt |
|---|---|---|---|
| `--format jsonl` | framed v1 machine route | fields only add; incompatible change adds a new version | positive and negative transcripts above |

