# Invocation and discovery — C0/C1

## Consumer/regime lookup

| Consumer regime | Contract must name |
|---|---|
| `human-interactive` | help, examples, prompt/TTY behavior, and readable result |
| `shell-pipeline` | stdin/operand behavior, framing, and stable parse route |
| `ci` | noninteractive inputs, exit/outcome rule, and retry signal |
| `agent` | discoverable syntax, machine result, and recoverable failure signal |
| `other-caller` | caller identity and equivalent invocation/result path |

Reject “users” when no row identifies a regime.

## Invocation decision lookup

| Question | Contract field |
|---|---|
| Which ecosystem parser rule applies? | Parser profile and target ecosystem |
| Can order, repetition, abbreviation, or `--` change parsing? | Ambiguous / invalid cases plus invocation table |
| Can input arrive through stdin? | stdin semantics, including `-` if admitted |
| How does a caller discover valid syntax? | help and at least one example |

Do not elevate GNU conventions to POSIX portability.

Use `--` only where the declared parser profile supports it.

A long option spelling does not promise that prefix abbreviations remain valid.

## Evidence boundary

CLI-001 supports a declared parser profile rather than universal grammar.

CLI-002 supports the bounded POSIX `--`/synopsis/parse-error baseline.

CLI-003 supports GNU help/version behavior and CLIG discovery guidance; neither is universal.

Source grades and limits live only in the forge ledger.

