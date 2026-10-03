# Forge verification ledger — designing-version-schemes

## 0. Function and placement

    versioning need + named consumers
      -- assign signals | select grammar | verify comparator -->
    VERSIONING CONTRACT
      --> accepted version policy and receipts

STOP: a manifest/release-script edit → implementing-and-debugging plus its language owner.
STOP: distribution or product-positioning decision → growing-oss-adoption.
STOP: metadata representation, signature, or canonicalization → governing-configuration-systems.

This is a reusable ownership void. Existing skills own implementation, adoption, and executable
configuration respectively; none owns the meaning, comparator, and range contract of a software
version identifier.

## 1. Source-grade table

| Rule | Source / locus | Grade | Disposition |
|---|---|---|---|
| Separate compatibility boundary, period, and release sequence before choosing notation. | User-provided live conversation, 2026-09-17 | observed-in-production | Require three signal fields. |
| SemVer grammar does not itself constitute SemVer conformance. | [SemVer 2.0.0 §§1–2, 6–8](https://semver.org/spec/v2.0.0.html) | author-confirmed | Require a SemVer claim and complete transition table. |
| Build metadata does not determine SemVer precedence. | [SemVer 2.0.0 §10](https://semver.org/spec/v2.0.0.html) | author-confirmed | Forbid using build metadata as the only ordering signal. |
| CalVer has multiple practical schemes rather than one mandatory format. | [CalVer — Scheme](https://calver.org/) | author-confirmed | Treat CalVer as a convention, not a parser guarantee. |
| VERSIONING CONTRACT, gates, and mechanical floor. | This forge | skill-supplied | Never present as a standards requirement. |

## 2. Calibration inversion

| | Source audience | Agent consumer |
|---|---|---|
| Dominant error | Overcalling a familiar syntax SemVer or CalVer without stating operational conditions. | Over-formalizing a simple local identifier and asserting ecosystem behavior from memory. |
| Corrective bias | State the intended segment meanings and exceptions. | Make MUST-NOT-FIRE and actual-comparator verification first-class. |
| Prominent guard | Hybrid-policy distinction. | V2/V4 stops plus direct-answer route for simple explanations. |

## 3. Verification record

Initial forge, 2026-09-17:

| Check | Receipt |
|---|---|
| Contract behavior | `bun test tests/versioning-contract-check.test.ts`: 4 pass, 0 fail, 9 assertions. |
| Proof of fire | The suite rejected an undecided SemVer claim, an unnamed comparator, and a missing transition field. |
| Script floor | `writing-bun-scripts/scripts/script-check.ts`: exit 0; FAIL=0 WARN=0. |
| Skill floor | `forging-skills/scripts/skill-check.ts`: exit 0; WARN=0. Collection floor: 66 skills, 61,723 chars. |
| Trigger desk-check | Six fire, six no-fire, and three ordered co-fire rows passed solo review against the named sibling descriptions. |
| F3 scale waiver | Solo tier: no agent can produce independent target comparator evidence. Semantic design and trigger adjudication remain solo. |

## 4. Maintenance triggers

- A named target comparator, package registry, or range language changes.
- A release incident reveals an unmodeled compatible feature, breaking change, period rollover, or range.
- A sibling changes its typed cut.
- The checker accepts an absent field or rejects a documented contract.
