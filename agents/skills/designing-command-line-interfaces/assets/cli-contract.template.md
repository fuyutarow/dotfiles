# CLI CONTRACT

Replace every `{{replace me}}` value. The checker rejects placeholders and only checks structure; it
does not prove semantic correctness, target behavior, or receipt truth.

## C0 CONSUMERS

- Consumer regimes: {{comma-separated human-interactive, shell-pipeline, ci, agent, other-caller}}

| Regime | Supported work | Noninteractive path | Machine-readable result |
|---|---|---|---|
| {{regime}} | {{work}} | {{path or n/a}} | {{result or n/a}} |

## C1 INVOCATION

- Parser profile: {{target ecosystem/profile}}
- Ambiguous / invalid cases: {{ordering, repetition, `--`, or parse rejection}}

| Synopsis / input | Ordering and repetition | stdin | Help / example |
|---|---|---|---|
| {{invocation}} | {{rule}} | {{rule}} | {{rule}} |

## C2 EFFECTS

- Effects / recovery: {{reads, writes, network, preview fidelity, force bypass, partial state, retry, cancellation}}

| Effect boundary | Preview / force | Partial state | Retry / cancellation |
|---|---|---|---|
| {{effect}} | {{rule}} | {{rule}} | {{rule}} |

## C3 CHANNELS

- Machine mode: {{none or named mode}}
- Machine framing: {{none or framing/schema}}
- Machine compatibility: {{none or stability/version promise}}

| Mode / TTY | stdout | stderr | Decoration / framing |
|---|---|---|---|
| {{mode}} | {{payload}} | {{diagnostic/progress}} | {{rule}} |

## C4 OUTCOMES

| Outcome class | Exit / status | Output | Retry / next action |
|---|---|---|---|
| {{outcome}} | {{mapping}} | {{channel}} | {{action}} |

## C5 EVOLUTION

- Positive receipt: {{accepted command, output, and exit}}
- Negative receipt: {{rejected command, output, and exit}}

| Surface | Promise | Change / deprecation | Verification receipt |
|---|---|---|---|
| {{surface}} | {{compatibility}} | {{policy}} | {{receipt}} |

