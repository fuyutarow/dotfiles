# Review decision checks

Date: 2026-10-14. Mode: serial source-backed desk review.
Reader: a Sui Move reviewer who knows Move syntax.
These checks exercise consequential corrections and adjacent negatives.
They are not runtime tests or an independent agent evaluation.

Each evidence key resolves through the [source map](../references/sources-and-adoption.md)
and the soks ledger rows SMR-001–011.

| Input / review situation | Expected decision | Source basis | Desk result |
|---|---|---|---|
| A module uses braces in edition 2024 | Do not report a compiler error from syntax alone | Parser braces/semicolon branches; SMR-003 | Confirmed by source |
| `public struct S { x: u64 }` is imported elsewhere | Public type does not authorize direct field access | Struct reference; SMR-002 | Confirmed by reference |
| `fun value(account: &Account)` is called as `account.value()` | Receiver need not be spelled self | Method resolution example; SMR-003 | Confirmed by reference |
| `payment.split(amount, ctx)` or `ctx.sender()` | Valid method pattern; preserve the context argument | Checklist and coin source | Confirmed by source |
| `#[error(code = 7)]` is used on a supported compiler | Do not forbid it; distinguish code from raw u64 | Clever Errors; SMR-004 | Confirmed by reference |
| A blank line is inserted before a clever abort | Do not promise raw error-value stability | Clever Errors; SMR-004 | Confirmed by reference |
| A bounded VecMap has 101 entries | Investigate workload; no mandatory migration by count | VecMap implementation; SMR-006 | No universal cutoff supported |
| A public accessor returns `&mut Balance<T>` | Trace authorization/invariant impact before finding a defect | coin::balance_mut; SMR-008 | Counterexample to blanket ban |
| A decoder appends an Option field to a legacy message | Require explicit schema/version compatibility | BCS format and peel_option; SMR-007 | Old missing tag is not auto-decoded |
| A complete-message decoder ignores leftover bytes | Require an explicit reason or reject the remainder | into_remainder_bytes API; SMR-007 | Constructed protocol check |
| A package uses lower_snake_case name | Do not demand PascalCase | Official minimal manifest; SMR-011 | Confirmed by example |
| An event uses Event suffix rather than past tense | Apply project policy; explain upstream disagreement | Two naming guides; SMR-005 | Disagreement preserved |
| An API is unused inside its own package | Check external users and upgrade contract before removal | Public API boundary; SMR-009 | Conservative review decision |
| A standalone Aptos module is supplied | Do not apply Sui framework rules | Declared scope | Boundary reviewed |
| User asks only to deploy or operate a TS SDK | Route to that task's owner; this guide does not cover it | Declared scope | Boundary reviewed |

## Acceptance

The entrypoint and references were read together after rewriting.
No old absolute compiler/security/gas/BCS claim remains the active rule.
Prior rule IDs are kept where useful; their old severity is not preserved as authority.
Structural, catalog and wiring check receipts are recorded in the task's completion report.
No improvement in model accuracy, execution cost or live selector recall is claimed.
