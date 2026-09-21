# Forge verification ledger

## 0. Source grades

| Rule / source claim | Grade | Source / boundary |
|---|---|---|
| stderr + nonzero exit for CLI failure | author-confirmed | Command Line Interface Guidelines, `#errors` and output sections, captured in soks evidence. |
| Precise primary/related loci and grouping | author-confirmed | GCC Guidelines for Diagnostics; rustc Development Guide, captured in soks evidence. |
| Standalone primary message and code only when it adds detail | author-confirmed | rustc Development Guide, captured in soks evidence. |
| Recovery is useful but redesign does not prove universal successful repair | author-confirmed | Barik et al. 2018 abstract; Taipalus et al. 2025, captured in soks evidence. |
| Cause-confidence modes and card field layout | skill-supplied | Conservative operationalization: no source in this corpus measures the safety of speculative fixes. |
| Floor checker | constructed | Mechanical field-presence and recovery-mode consistency only; it cannot prove semantic truth. |

## 1. Function map and placement

`failure surface + observed evidence --design--> DIAGNOSTIC CARD --> emitted diagnostic plus positive/negative receipt`

The terminal artifact and stop are distinct from wording (`linting-prose`), root-cause repair
(`implementing-and-debugging`), configuration authority (`governing-configuration-systems`), and
interaction recovery (`designing-interactions`). This is a reusable ownership void, not an extension
of any one of those artifacts.

## 2. Calibration inversion

| | Source audience | Agent consumer |
|---|---|---|
| dominant error | Developers receive opaque, poorly located failures | Agent invents a confident cause/fix from incomplete evidence |
| corrective bias | Add explanation and recovery | Make observed condition and recovery confidence first-class |
| prominence | Helpful detail | D2 GROUND and D3 RECOVER deny speculative imperatives |

## 3. F3 verification receipts

Solo-tier waiver (2026-09-17): no agent fan-out was used. This bounded procedural skill was
verified serially against the reconciled source position, explicit sibling cuts, a trigger
desk-check, a red/green floor test, and the collection floor.

| Check | Result |
|---|---|
| Structural floor on valid fixture | PASS — `bun scripts/diagnostic-card-check.ts tests/fixtures/valid-card.md`, 2026-09-17. |
| Structural floor negative test | PASS — `exact` with `Preconditions: none` emitted `exact recovery requires Preconditions`, 2026-09-17. |
| Trigger desk-check | PASS — F1–F5 fire; F6–F10 route to their named owners, 2026-09-17. |
| House skill floor | PASS — `bun ../forging-skills/scripts/skill-check.ts .`, 2026-09-17; no WARN. |

## 4. Staleness triggers

- A measured production failure caused by a diagnostic this card would accept.
- A new adjacent skill changes the typed cut.
- Replicated evidence on expert/running-system diagnostic recovery changes the bounded position.
