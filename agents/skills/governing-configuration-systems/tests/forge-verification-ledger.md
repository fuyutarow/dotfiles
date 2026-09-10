# Forge verification ledger — governing-configuration-systems

## 0. Function and placement

    configuration request + consumer/trust regime
      -- classify | specify | audit -->
    CONFIGURATION CONTRACT
      --> target-accepted effective declaration + acceptance receipt

STOP: parser/schema/API implementation → language owner.
STOP: layer admission/order → wiring-repositories.

This is a new ownership void: wiring-repositories chooses repository layers and wiring order;
operating-the-harness owns .claude mechanics; language skills own manifest/parser detail;
practicing-tiger-style owns risk posture; governing-research-documentation owns R&D documents.
This skill owns cross-domain executable configuration representation, authority, and verification.

## 1. Source-grade table

| Rule | Source / locus | Grade | Source-local status | Skill disposition |
|---|---|---|---|---|
| JSON syntax is not canonical bytes; JCS is an explicit profile with input restrictions. | RFC 8259 §§2,4,7 https://www.rfc-editor.org/rfc/rfc8259.html; RFC 8785 §§3.1–3.2.3 https://www.rfc-editor.org/rfc/rfc8785.html; SoK evi 01a089d8-d3ce-7045-af0b-e4d825b4d85c / 01a089d8-d3f4-7711-ac4f-af813850dbda; ledger CFG-001/002 | author-confirmed | supported | Require a named raw-byte or canonical boundary. |
| JWS signs a defined encoded input but leaves payload schema and signature acceptance partly to the application. | RFC 7515 §§3.3,5.1,5.2 https://www.rfc-editor.org/rfc/rfc7515.html; SoK evi 01a089d8-d414-74c6-abe0-344ff710998f; ledger CFG-003 | author-confirmed | supported | Require target schema/key/acceptance evidence separately. |
| TOML maps unambiguously to a hash table while retaining multiple source forms. | TOML v1.0.0 Objectives, Keys, Table, Inline Table, Array of Tables https://toml.io/en/v1.0.0; SoK evi 01a089d8-d437-7470-8026-f1df2d01a680; ledger CFG-004 | author-confirmed | supported | Do not reject TOML as semantically ambiguous; name a serializer only for semantic integrity. |
| Cargo, PyPA, and mise distinguish role, writer, namespace, or scope in configuration. | Cargo opening https://doc.rust-lang.org/cargo/guide/cargo-toml-vs-cargo-lock.html; PyPA opening https://packaging.python.org/en/latest/specifications/pyproject-toml/; mise hierarchy https://mise.jdx.dev/configuration.html; SoK evi IDs 01a089d8-d475-7458-ba7f-9d1501e2cd82, 01a089d8-d491-72b4-a372-e11d52415043, 01a089d8-d4ae-7060-baf5-69116e8d0b2e; ledger CFG-006/007 | author-confirmed | supported with limitations | Classify role before format; never claim universal ecosystem consensus. |
| Effective declaration versus decision-record split. | No primary source in the bounded corpus; ledger CFG-008 | skill-supplied | not a source mandate | Apply only when machine state, rationale, exception, and lifecycle have distinct readers. |
| X.509/DER comparison. | RFC 5280 §4.1.1.3 https://www.rfc-editor.org/rfc/rfc5280.html; RFC 8785 §§1,3 https://www.rfc-editor.org/rfc/rfc8785.html; SoK evi 01a089d8-d459-722d-a589-44c8840299ca / 01a089d8-d3f4-7711-ac4f-af813850dbda; ledger CFG-005 | constructed | limited synthesis | Compare specified bytes only; never claim protocol equivalence. |

## 2. Calibration inversion

| | Source audience | Agent consumer |
|---|---|---|
| Dominant error | Under-specifying an interoperable data/signature representation. | Over-applying strict JSON, JCS, or event records as ceremony. |
| Corrective bias | Name precise serialization and verification behavior. | Start with consumer/trust regime; keep MUST-NOT-FIRE first-class. |
| Prominent guard | Canonical profile details. | Typed routing and conditional gates before format preference. |

## 3. Verification record

Initial forge, 2026-09-10:

| Check | Receipt |
|---|---|
| Contract behavior | bun test tests/configuration-contract-check.test.ts: 21 pass, 0 fail, 47 assertions. |
| Valid input | configuration-contract-check against valid-contract.md: exit 0; C1/C2/C3 PASS; FAIL=0. |
| Proof of fire | The same test run receives exit 1 for missing profile, strict JSON, negated boundaries, n/a payloads, placeholders, malformed regime, duplicate field, missing required fields, and comment-only dispositions. |
| Script floor | writing-bun-scripts script-check: exit 0; FAIL=0 WARN=0. |
| Skill floor | forging-skills skill-check on this skill: exit 0; no output, including zero prose-debt warnings. |
| Trigger desk-check | Six fire, six no-fire, and three ordered co-fire rows were reviewed independently. One .claude co-fire ambiguity was repaired. |
| Architecture audit | Independent review found C3 ceremony, C5 effective-input, one-home, source-locus, and reciprocal-cut defects. Each was repaired before this record. |
| Behavior audit | Independent adversarial tests found boundary, placeholder, Markdown, and disposition false passes/rejects. The parser and suite were expanded to 21 green tests. |

A green mechanical floor does not verify source truth, target semantics, or deployment acceptance.

## 4. Maintenance triggers

- A source position changes its status or a named canonicalization/signature profile moves.
- A real configuration incident reveals an unnamed merge, authority, encoding, or acceptance boundary.
- A sibling changes its typed cut.
- The contract checker fails to reject a missing conditional field or rejects a valid documented regime.
