# Editions — gate N5 detail

> Scope: the EDITION / REVISION lifecycle and acceptance for model code in a notebook repo. Language-agnostic.
> Julia module mechanics are `writing-julia`'s. Device kernel design is `optimizing-julia-gpu-kernels`'. Evidence meaning is `validating-experimental-evidence`'.

## §1 Revise or new edition

| Situation | Decision |
|---|---|
| a defect, a missing mechanism, a performance fix, a conformance repair | REVISION of the current edition, by minimal diff |
| a predecessor edition holds a working mechanism the current one lacks | REVISION that ports that mechanism |
| the owner changed the design frame | NEW edition; the new frame is its default path |
| a new frame expressed as an off-by-default switch on an old edition | refused; make the NEW edition |
| a committed edition or revision would be edited in place | refused; bump the REVISION |
| a rewrite seems simpler than a revision | REVISION anyway, unless the owner changed the frame |

A NEW edition starts with its predecessor-row gate (§4 b) red until it matches every member a predecessor solved.

## §2 Registration — complete only when every registry the launcher resolves has the entry

| Registry kind | Entry | Checker |
|---|---|---|
| edition source | the module, a REVISION constant, a public list | the package loads |
| package include | the include line in the package's entry file | the package loads |
| model interface | the methods the launcher's interface calls | the interface test |
| model registry | the slug entry the launcher resolves | registry lookup of the slug; registry validator |
| versions ledger | `[revision.N]` with its code digest | the digest checker |
| digest checker table | the edition's code-set row | the checker's selftest |
| edition catalog | status, latest revision, conformance record | the catalog test |
| version test | REVISION positive; ledger digest equals the computed digest | the package test task |
| launch params | the params file naming the slug | launcher `--dry-run` resolves the slug and revision |

Find each registry with `mise tasks` and `repo-retrieve concept`.
Count them. A registration that misses one is incomplete.

## §3 Revision bump — in this order

| # | Act | Check |
|---|---|---|
| 1 | Edit the source; bump the REVISION constant. | — |
| 2 | Run the formatter on the changed files. | formatted before hashing |
| 3 | Compute the digest with the checker's `--worktree` mode. | digest printed |
| 4 | Append `[revision.N]`: digest, rule, what changed, what stays bit-identical. | digest checker green |
| 5 | Set the catalog's latest revision; update status and note. | catalog test green |
| 6 | Run the acceptance rows (§4). | all green |
| 7 | Hand back paths; the COMMITTER lands them. | commit receipt |
| 8 | `--dry-run` the launch. | revision equals N; digest equals the ledger |

A shared-library change that touches a used name changes each consumer's digest.
Each consumer then needs its own REVISION bump.

## §4 Acceptance rows — written before code, all mechanical

| Row | Template | Red when |
|---|---|---|
| (a) conformance | Run the OFFICIAL entry path on the real benchmark contract and assert each design line. | it runs a fixture; it uses another label layout or path than the official run |
| (b) predecessor row | For each member a predecessor solved, assert this REVISION ≥ the best committed predecessor row on the same contract. | any member falls below |
| (c) throughput floor | Assert throughput ≥ a floor derived from the budget. | below the floor |
| (d) bit equality | Assert CPU output == GPU output, bit for bit, where both paths exist. | any bit differs |
Each row carries a teeth case: a known-broken input that must turn it red.
Until (a) to (d) are green, the REVISION's numbers are diagnostics, not progress.
A predecessor row counts only if valid per `validating-experimental-evidence` EV1–EV3.
An ineligible one is an oracle reference.
The regression claim itself is EV4's.

## §5 Shared-primitive library

| Rule | Check |
|---|---|
| A public name's meaning never changes. A behavior change takes a new name. | review of the diff: no existing name gains a method |
| Every function has an oracle test: host-loop oracle, negative cases, CPU == GPU where possible. | the library's test file per function |
| A replaced edition body gets a bit-identity test against a frozen copy. | that test |
| The library's digest closure enters each consumer edition's code digest. | the digest checker |
| Editions adopt a new primitive in their next REVISION, not in place. | the consumer's ledger |

Every edition ticket carries a kernel → primitive table before code:

| Edition kernel | Library primitive | Decision |
|---|---|---|
| `<kernel>` | `<name>` or "none: N2 battery line" | reuse / add primitive / edition-specific, with the reason |

A kernel marked edition-specific without an N2 battery line fails the ticket.
