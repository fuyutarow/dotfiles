---
name: designing-developer-diagnostics
description: >-
  Designs and reviews developer-facing DIAGNOSTIC messages for CLI, config validation, compiler,
  build, and tool failures — error messages / エラーメッセージ, diagnostics / 診断, stderr,
  exit code, source span, hint, suggestion, actionable error, helpful error, and failure UX.
  Use when a developer must identify a failure and choose a correct next action. PURPOSE: wording
  alone → linting-prose; root-cause investigation or implementation → implementing-and-debugging
  first; configuration authority/integrity → governing-configuration-systems; interaction flow or
  end-user GUI recovery → designing-interactions. Workflow-native: card design and final verdict
  stay SOLO; exact diagnostic receipts may fan out. English skill; respond in the user's language
  (default Japanese).
---

# Designing developer diagnostics

> **Version**: v2609.1.0 (2026-09-17).
> Source position: `sok-developer_facing_diagnostic_messages` at `06203eb`.

```sh
for f in diagnostic-design.md; do test -f references/$f || echo MISSING "references/$f"; done
test -f assets/diagnostic-card.md || echo MISSING diagnostic card
test -f scripts/diagnostic-card-check.ts || echo MISSING diagnostic checker
test -f tests/diagnostic-card-check.test.ts || echo MISSING checker test
test -f tests/triggers.md || echo MISSING trigger set
test -f tests/forge-verification-ledger.md || echo MISSING forge ledger
bun test tests/diagnostic-card-check.test.ts
bun scripts/diagnostic-card-check.ts tests/fixtures/valid-card.md
bun ../forging-skills/scripts/skill-check.ts .
```

## Language

This skill is English; respond in the user's language.

Keep **LAW**, **DIAGNOSTIC CARD**, **observed condition**, **locus**, **recovery mode**,
**receipt**, **exact**, **conditional**, **investigate**, and **SOLO** stable.

## LAW — the SOLE owner of the DIAGNOSTIC CARD

> A developer-facing diagnostic is a failed contract plus the safest next observation or repair.
> It identifies an observed condition at its locus before it explains a cause or proposes a fix.
> Human-readable recovery and machine-readable failure signaling are separate obligations.

This skill owns the **DIAGNOSTIC CARD**: a design and verification artifact for one failure class.
It does not prove the root cause, choose a configuration authority, or replace a language's API.

Never turn an unverified hypothesis into an imperative fix.

## Gates — every gate leaves an artifact

| Gate | Decision | Required artifact / stop |
|---|---|---|
| **D1 SURFACE** | Who receives this failure and through which machine contract? | Name surface, severity, exit/response channel, and renderer. Stop if “an error occurred” is the only contract. |
| **D2 GROUND** | What was observed, where, and how certain is any cause? | `Observed condition`, exact locus/evidence, and `Cause confidence`. Stop if a message asserts an unobserved cause. |
| **D3 RECOVER** | Can the tool offer a safe repair now? | Select `exact`, `conditional`, `investigate`, or `none`. Exact requires tested recovery plus preconditions. |
| **D4 SHAPE** | Can a developer understand the primary failure in isolation and connect related evidence? | Standalone primary message; related loci as labeled notes; stable code only if it adds explanation; group causal follow-ups. |
| **D5 RECEIPT** | Does the actual tool emit the intended human and machine result? | A card validated by the floor plus positive and negative execution receipts. |

Start from [diagnostic-card.md](assets/diagnostic-card.md). Run the checker before judging the
message. The checker is a structural floor, not a semantic assessment.

## Workflow

1. Run D1 before drafting a sentence. Read [diagnostic-design.md](references/diagnostic-design.md).
2. Run D2. State only the observed condition in the primary message.
   Place a proven cause in an explanation. Keep a candidate conditional. Investigate an unknown.
3. Run D3. An exact repair includes the tested command/config change and its preconditions.
   A conditional recovery says when it applies. An investigation names the next observable.
4. Run D4. Locate the entire offending expression/key.
   Attach a related declaration or prior use as a note. Do not merge independent failures.
5. Fill the card, run the floor, and exercise D5 against the actual diagnostic path.

## Execution model

Classification, cause-confidence, recovery selection, and final diagnostic verdict stay **SOLO**.
Source snippets and positive/negative receipts may **FAN-OUT** only with their exact locus/output.
Agent agreement cannot prove a cause or validate a repair. No harness → same map, serial.

## MUST-NOT-FIRE and routing

| Ask | Route |
|---|---|
| “Polish this already-correct one-line error.” | `linting-prose` — word choice and reader fit. |
| “Why does this command/config fail; fix it.” | `implementing-and-debugging` first; use this skill once the failure class is known. |
| “What configuration is authoritative, signed, or effective?” | `governing-configuration-systems`. |
| “Design the modal, retry flow, or recovery UI for an end user.” | `designing-interactions`. |
| “Add telemetry, logs, traces, or an incident dashboard.” | Implement under the relevant domain owner; this skill owns emitted diagnostics, not observability architecture. |
| “Which Rust/Python/TypeScript diagnostic API should I call?” | The applicable `writing-*` skill; co-fire this skill for the diagnostic card. |
| “Create or revise a Skill.” | `forging-skills`. |

## Reference index

| File | Covers | Read when |
|---|---|---|
| [diagnostic-design.md](references/diagnostic-design.md) | The card field meanings, recovery certainty, locus/grouping rules, source grades, and evaluation limits | Filling or reviewing a card. |
| [diagnostic-card.md](assets/diagnostic-card.md) | Copyable one-diagnostic artifact | Designing a diagnostic. |
| [triggers.md](tests/triggers.md) | F3 fire/no-fire desk-check set | Editing the description. |
| [forge-verification-ledger.md](tests/forge-verification-ledger.md) | Source grades, function map, and verification findings | Reforging or challenging a rule. |
