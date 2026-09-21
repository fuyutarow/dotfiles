# Versioning semantics — the SOLE home of standard-label rules

> **Dated primary-source position**
>
> Verified: 2026-09-17.
>
> Re-fetch every cited source before a reforge.

This reference does not make a target ecosystem conform to either convention.

## Source position

| Claim | Primary source | Use in this skill |
|---|---|---|
| SemVer is `MAJOR.MINOR.PATCH`; incompatible public API changes increment MAJOR, compatible functionality increments MINOR, and compatible bug fixes increment PATCH. | [SemVer 2.0.0 §§1–2, 6–8](https://semver.org/spec/v2.0.0.html) | `conformant` requires both grammar and transition semantics. |
| SemVer build metadata is ignored for precedence. | [SemVer 2.0.0 §10](https://semver.org/spec/v2.0.0.html) | Do not place ordering only in build metadata when ordering is required. |
| CalVer is a convention based on a project's release calendar; it has multiple practical schemes and standard date-segment terms. | [CalVer — Scheme](https://calver.org/) | Use CalVer as a calendar-centered convention, not a single mandatory grammar. |
| A target ecosystem can have a distinct version grammar and dependency-specification language. | [PEP 440](https://peps.python.org/pep-0440/) | Verify the actual target, rather than inferring acceptance from a generic label. |

## Scheme classifier

| Public promise | Dominant operational need | Scheme label | Non-negotiable check |
|---|---|---|---|
| Full SemVer transition semantics | Dependency users distinguish compatible features from bug fixes. | SemVer | Public API declared; transition table obeys MAJOR/MINOR/PATCH rules. |
| Release time/support period | Operators need a date-grounded release identity. | CalVer | Calendar, time-zone/period boundary, and same-period revision rule are named. |
| Breaking boundary + maintenance period + every release sequence | One identifier must convey all three signals. | Custom compatibility-bound calendar scheme | Segment names and all transition cases are written; no SemVer conformance claim unless its rules are actually obeyed. |
| Ecosystem comparator constrains syntax/ranges | Registry or package manager is the binding reader. | Target-specific scheme | Real target parser and range resolver accept the examples. |

## Custom compatibility-bound calendar scheme

`MAJOR.YYYYMM.REVISION` is a valid three-numeric-segment SemVer shape without leading zeroes.

It is **not automatically SemVer**.

SemVer assigns behavior to MINOR and PATCH, not merely numeric positions.

Use these meanings only when the contract states them:

| Segment | Meaning | Transition |
|---|---|---|
| `MAJOR` | Breaking public compatibility boundary. | Increment only for a breaking change to the declared contract; reset subordinate fields by the chosen policy. |
| `YYYYMM` | Actual release/maintenance month. | Change at the declared calendar boundary, not to smuggle an unrelated feature increment. |
| `REVISION` | Release sequence inside that month. | Increment for every release in the month; call it `PATCH` only when every increment is a compatible bug fix. |

Use this scheme only when all three signals are genuinely required.

A compatible feature and a bug fix may both increase `REVISION`.

Consumers must not infer SemVer's MINOR/PATCH distinction from it.

## Comparator probe

Before freezing any versioning scheme, execute the real target against these examples:

1. Parse the first release and the next same-period release.
2. Sort a period rollover and a MAJOR change in the intended order.
3. Resolve the exact dependency range syntax used by consumers.
4. Reject one malformed identifier or unsupported range.
5. If pre-release/build metadata is allowed, verify its precedence rather than assuming it.

The checker can prove that a contract names these tests.

Only the target's observed receipt proves that a target accepts them.
