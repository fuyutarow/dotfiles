# Fire / no-fire desk-check — designing-version-schemes

Read only this skill's name and description plus plausible siblings. A race is a description or
cut defect.

## FIRES

| Ask | Why here |
|---|---|
| “We publish a Go SDK: should `2026.09.1` replace SemVer?” | A scheme and compatibility promise are undecided. |
| 「MAJOR.YYYYMM.REVISION の Z は PATCH と呼んでよい？」 | Segment semantics need an explicit contract. |
| “Our internal packages use `^1.202609.0`; prove what it admits.” | Target range behavior is a V2/V4 decision. |
| 「毎月一回以上機能を出す SaaS のバージョニング規約を監査して」 | Same-period feature transition is central. |
| “Do dates belong in a semver build suffix or the comparable core?” | Chronology versus precedence needs selection. |
| “This release policy says SemVer but bumps PATCH for features. Is that honest?” | SemVer claim audit. |

## MUST NOT FIRE

| Ask | Route |
|---|---|
| “Set `version = \"1.2.3\"` in pyproject.toml.” | implementing-and-debugging + writing-python. |
| “Use cargo release to publish 1.2.3.” | writing-rust. |
| “Rename the version-two product launch.” | growing-oss-adoption. |
| “Sign the release manifest with canonical JSON.” | governing-configuration-systems. |
| “What does `1.2.3` mean in this README?” | Direct answer. |
| “Fix the broken parser that compares versions.” | implementing-and-debugging + language owner. |

## Ordered co-fire

| Braided ask | Order |
|---|---|
| “Publish our Rust crate and choose an honest versioning policy.” | HERE chooses the contract → writing-rust implements and publishes it → growing-oss-adoption handles distribution positioning. |
| “Make signed release metadata follow our version policy.” | HERE chooses version semantics → governing-configuration-systems specifies representation and integrity. |
| “Change a release script to enforce this new scheme.” | HERE freezes the contract → implementing-and-debugging changes the script. |

## Regression predicate

The description must expose versioning, SemVer, CalVer, `MAJOR.YYYYMM.REVISION`, compatibility,
range, and Japanese versioning terms. It must route manifest edits, adoption work, and signed
configuration away.
