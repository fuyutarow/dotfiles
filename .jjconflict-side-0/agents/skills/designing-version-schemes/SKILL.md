---
name: designing-version-schemes
description: >-
  Designs and audits software versioning schemes as compatibility, chronology, and release-order
  contracts. Use for versioning / version number / release version / SemVer / CalVer /
  MAJOR.MINOR.PATCH / MAJOR.YYYYMM.REVISION / version range / compatibility policy /
  バージョニング / バージョン番号 / リリース番号 / セマンティックバージョニング /
  カレンダーバージョニング / 互換性 / 版番号規約. Produces a VERSIONING CONTRACT that names
  consumers, comparator, grammar, segment ownership, transitions, and acceptance receipts.
  DECISIVE: version meaning and comparison/range contract → HERE; package manifest syntax or
  registry command → writing-*; release distribution, naming, and adoption → growing-oss-adoption;
  executable configuration representation/integrity → governing-configuration-systems. This is
  not SemVer merely because it parses as X.Y.Z. Modal work stays SOLO; facts and target-parser
  receipts may be gathered separately. English skill; respond in the user's language (default Japanese).
---

# Designing version schemes

> **Version**: v2609.1.0 (2026-09-17) — initial forge from a live session and primary specifications.

```bash
test -f assets/versioning-contract.template.md
test -f references/versioning-semantics.md
test -f scripts/versioning-contract-check.ts
test -f tests/versioning-contract-check.test.ts
test -f tests/fixtures/valid-contract.md
test -f tests/triggers.md
test -f tests/forge-verification-ledger.md
bun test tests/versioning-contract-check.test.ts
bun scripts/versioning-contract-check.ts tests/fixtures/valid-contract.md
bun ../forging-skills/scripts/skill-check.ts .
```

## Language

This skill is English; respond in the user's language.

Keep **LAW**, **VERSIONING CONTRACT**, **compatibility boundary**, **chronology**, **release order**,
**comparator**, **grammar**, **SemVer claim**, **REVISION**, and **SOLO** stable.

## LAW — the SOLE owner of the VERSIONING CONTRACT

> Assign each version segment one declared signal before choosing its spelling.
>
> The target comparator and range resolver, not visual familiarity, decide whether a scheme works.
>
> A grammar-compatible `X.Y.Z` string is not a Semantic Versioning promise.

This skill owns the **VERSIONING CONTRACT**.

The artifact names consumer, comparator, public compatibility contract, grammar, and transitions.

It also carries range behavior and acceptance receipts.

It does not treat a numeral's size as a measure of change size.

It does not call a release sequence `PATCH` when it can contain more than compatible bug fixes.

It does not use build metadata as an ordering signal when the comparator ignores it.

## Gates — every gate leaves an artifact

| Gate | Decision | Required artifact / stop |
|---|---|---|
| **V1 SIGNALS** | Which reader needs compatibility, chronology, or release-order information? | Name each signal and its owner. Stop if “versioning” is the only requirement. |
| **V2 COMPARATOR** | Which parser, registry, package manager, or deployment system compares this identifier and ranges? | Name its grammar and range semantics. Stop if consumer or comparator is unnamed. |
| **V3 POLICY** | Is this SemVer, CalVer, or a custom scheme using one of their grammars? | Fill transitions for compatible feature, compatible bug fix, breaking change, same-period release, and rollover. |
| **V4 ACCEPTANCE** | Can the actual target parse, sort, and resolve the intended examples and ranges? | Run the target path; retain positive and negative receipts. |

Start from [versioning-contract.template.md](assets/versioning-contract.template.md).

Run the contract checker before interpreting the contract.

## Decision table

| If the binding requirement is… | Select | State plainly |
|---|---|---|
| A published API's compatible features and bug fixes need distinct dependency signals. | SemVer. | Public API plus MAJOR/MINOR/PATCH transitions. |
| Release date or support window is the primary signal; SemVer feature/bug taxonomy is not promised. | CalVer. | Calendar fields, calendar/time-zone rule, and revision behavior. |
| Compatibility boundary, maintenance period, and release order all need one comparable identifier. | A custom scheme, e.g. `MAJOR.YYYYMM.REVISION`. | `MAJOR` is breaking compatibility; `YYYYMM` is actual period; `REVISION` is every in-period release. Mark its SemVer claim `syntax-only` or `not-claimed`. |
| The target has its own comparator or range language. | Target-specific policy. | Verify the exact grammar and ranges before naming the scheme. |

For `MAJOR.YYYYMM.REVISION`, `REVISION` names the in-period release sequence.

Call it `PATCH` only when every such release is a compatible bug fix.

## Workflow

1. Run V1–V2. Name the public contract, every consumer, and the target comparator.
   Read [versioning-semantics.md](references/versioning-semantics.md) before using standard labels.
2. Fill the VERSIONING CONTRACT. Give each signal one segment or an explicit external home.
3. Run V3. Do not call a custom calendar hybrid SemVer unless its transitions obey SemVer.
4. Run the mechanical floor. Then execute the target parser, registry, or range resolver.
5. Retain one accepted and one rejected receipt. If no target exists, mark acceptance as pending;
   do not claim interoperability.

## MUST-NOT-FIRE and the fire/no-fire set

This is the F3 trigger artifact. Its verification is solo-tier: the modal task is one contract,
and no independent agent produces a target comparator receipt.

### FIRES

| Ask | Why here |
|---|---|
| “Should this library use SemVer or CalVer?” | The signal and comparator decision is the owned transition. |
| 「MAJOR.YYYYMM.REVISION って成立する？」 | A custom hybrid needs segment and transition semantics. |
| “Can we call `1.202609.3` SemVer?” | Grammar and promised SemVer behavior must be separated. |
| 「月内に複数回リリースする場合の版番号規約を決めたい」 | Same-period transition is a VERSIONING CONTRACT field. |
| “Will `^1.202609.0` resolve safely in our registry?” | Range behavior requires the real comparator. |
| “Audit this release version policy for mislabeled PATCH releases.” | Segment ownership and transition audit. |

### MUST NOT FIRE

| Ask | Route |
|---|---|
| “Change the `version` field in this `pyproject.toml`.” | implementing-and-debugging plus writing-python. |
| “Which Cargo.toml release command publishes this crate?” | writing-rust; adoption concerns co-fire growing-oss-adoption. |
| “Choose a memorable product name for v2.” | growing-oss-adoption. |
| “Sign this release manifest and define its canonical JSON.” | governing-configuration-systems. |
| “What does this existing version string mean?” | Answer directly when no policy decision is required. |
| “Bump the version and publish now.” | The project release workflow; this skill only if the policy remains undecided. |

## Routing — sibling cuts

| Sibling | Cut |
|---|---|
| `growing-oss-adoption` | PURPOSE: version semantics, comparator, and range contract → HERE; release distribution, adoption cadence, public positioning, and naming → there. |
| `governing-configuration-systems` | DECISIVE: version identifier and its comparator policy → HERE; source/effective declaration, canonical representation, signing, and configuration acceptance → there. |
| `writing-python` / `writing-rust` / `writing-typescript` | DECISIVE: a language ecosystem's manifest syntax, API, or publish command → the language owner; a cross-ecosystem versioning policy before that implementation → HERE. |
| `implementing-and-debugging` | PURPOSE: a concrete version-field or release-script change → there; selecting or auditing the scheme it implements → HERE. |
| `driving-git` | DECISIVE: what a version or tag MEANS → HERE; `git tag` / tag-push mechanics and every other git operation → there (2026-09-21). |

## Reference index

| File | Covers | Read when |
|---|---|---|
| [versioning-semantics.md](references/versioning-semantics.md) | Dated primary-source position: SemVer obligations, CalVer terminology, custom-hybrid rules, and comparator probes | Selecting a scheme, labeling SemVer/CalVer, or reviewing range behavior. |
| [versioning-contract.template.md](assets/versioning-contract.template.md) | Required VERSIONING CONTRACT fields and transition cases | Starting a new decision record. |
| [versioning-contract-check.ts](scripts/versioning-contract-check.ts) | Mechanical field-presence floor; run it, do not read it as semantic proof | After filling or editing a contract. |
| [triggers.md](tests/triggers.md) | Fire/no-fire desk-check | Editing the description or sibling cuts. |
| [forge-verification-ledger.md](tests/forge-verification-ledger.md) | Source grades, calibration, verification receipts, and maintenance triggers | Reforging or challenging a rule. |
