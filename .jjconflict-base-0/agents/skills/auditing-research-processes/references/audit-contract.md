# Audit contract

## Admission and identity

Admit only a terminal, stopped, failed, aborted, or explicitly bounded episode audit. The
request must name the episode boundary and provide evidence locators. A current live section is
not retrospectively frozen merely because someone asks for advice.

The auditor's actor instance must differ from the episode author, Programme Supervisor, and
Section Director. Record all four identities or mark independence `NOT-EVIDENCED`. Role labels
are not proof of instance separation.

## Evidence packet

The packet should contain its scope, terminal status, frozen charter/intents/receipts/verdicts,
declared denominator, locators, and digests. Use existing checkers only for their declared
structural floor. Missing freeze, denominator, or terminal receipts produces a bounded
`UNAUDITABLE` auditability status or `NOT-EVIDENCED` lens verdict, never a reconstructed history.

Exclude chain-of-thought, private transcripts, prompt/control text, credentials, and secrets.
The auditor preserves input evidence byte-for-byte and writes only a new audit artifact.

## Output authority

`RESEARCH_PROCESS_AUDIT` owns auditability, findings, limitations, and typed recommendations.
Freeze it outside Programme Supervisor visibility. It is not an upward packet.

`AUDIT_RECOMMENDATION` is the sole upward return. Its body must exactly use
`research-audit-recommendation/v2` from `assets/AUDIT-RECOMMENDATION.md`. Declassification fails
closed: any missing canonical field, nested raw section content, or value other than
`RAW_SECTION_CONTENT_INCLUDED: NO` and `AUTHORITY: RECOMMENDATION_ONLY` rejects the return.

Allowed recommendation types are `REOPEN_CONSIDERATION`, `RETIRE_CONSIDERATION`,
`PROCESS_REPAIR`, `EVIDENCE_RECOVERY`, and `NO_ACTION_SUPPORTED`. It names a potential recipient
but has no imperative authority.

Forbidden outputs are programme/section state edits, candidate admission, run intent, programme
decision, Section Mandate, transition command, evidence rewrite, or upward full audit. `REOPEN`
and `RETIRE` are words in a recommendation type only. Only the Programme Supervisor may later
write an independent `PROGRAMME_DECISION`.

## Routes

Use `arguing-research-papers` for a finished scientific claim/paper's argument. Use
`supervising-research-programmes` for programme design and `directing-research-sections` for
active section work. Use the relevant implementation owner or `operating-the-harness` for generic
software, dispatch, hook, permission, or control-plane incidents.
