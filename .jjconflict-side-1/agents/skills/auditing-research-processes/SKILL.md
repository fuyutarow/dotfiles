---
name: auditing-research-processes
description: >-
  Audits one frozen research episode's evidence and process integrity, producing a
  frozen RESEARCH_PROCESS_AUDIT plus a declassified, non-enacting AUDIT_RECOMMENDATION.
  Use for research
  retrospective, episode audit, process postmortem, 研究プロセス監査, 研究の事後検証,
  終了した研究の振り返り, or 失敗・停止した研究の監査. PURPOSE cut: this audits a
  frozen terminal research episode; scientific claim/paper appraisal belongs to
  arguing-research-papers, and software/control-plane incidents belong to their domain
  implementation or harness skill. It never directs live work or enacts a transition.
  Workflow-native: evidence joining may be checked mechanically, but audit judgment stays SOLO.
  English skill; respond in the user's language (default Japanese).
---

# Auditing research processes

> **Version**: v2608.1.0 (2026-08-03) — terminal-episode audit authority split from research direction.
> No harness → same map, serial. Durable operating guidance from a frontier model (2026-08).
> If a constraint here feels unnecessary, that feeling is the failure mode — follow the map.

## LAW

> An audit is an evidence-bounded account of a **past frozen episode**, not a control
> surface for changing its programme, section, evidence, or future work. Missing evidence
> narrows the verdict; it never authorizes invented causality.

## Function map and one-home ownership

```text
frozen terminal/stopped/failed episode packet + evidence locators
  --audit integrity--> frozen RESEARCH_PROCESS_AUDIT + declassified AUDIT_RECOMMENDATION
  --> Programme Supervisor may independently decide; no audit-state mutation
```

| Function | Sole artifact owner | Handoff / stop |
|---|---|---|
| Programme design, issue admission, programme transition | `supervising-research-programmes` | programme artifacts only |
| One live research section and local evidence | `directing-research-sections` | section signal or terminal packet |
| **Frozen episode process audit** | **HERE** | frozen audit + declassified recommendation; stop |
| Scientific claim or paper argument | `arguing-research-papers` | CLAIM SPEC |
| Software or control-plane incident review | relevant domain skill / `operating-the-harness` | incident finding |

The **PURPOSE cut** is decisive: this skill asks whether a bounded research episode's
record supports process findings. It does not decide whether a claim is true, assign a
director, or repair a harness incident.

## Gates

| Gate | Require | Artifact / fail-closed result |
|---|---|---|
| A1 ADMIT | terminal, stopped, failed, or explicitly bounded episode audit; evidence locators; distinct auditor instance | audit scope or no-fire route |
| A2 FREEZE | immutable/frozen evidence packet, or an explicit missing/freeze boundary | `AUDITABILITY=UNAUDITABLE` / `NOT-EVIDENCED` |
| A3 SEPARATE | auditor is not episode author, Programme Supervisor, or Section Director | actor provenance in audit |
| A4 LENS | one typed verdict per applicable lens with locus and limitation | findings table |
| A5 RETURN | declassify only the canonical recommendation surface | `AUDIT_RECOMMENDATION`; no mutation |

## Procedure

1. Read [audit-contract.md](references/audit-contract.md) before admitting the request.

   Refuse live progress or an unbounded history. Route non-research incidents away.

2. Identify the episode boundary, terminal status, evidence locators, and auditor identity.

   Do not read or reproduce private reasoning, transcripts, prompts, credentials, or secrets.

3. Read [auditability-lenses.md](references/auditability-lenses.md). Join the denominator
   and receipts with an existing structural checker.

   A structural PASS is shape evidence only.

4. Fill [RESEARCH-PROCESS-AUDIT.md](assets/RESEARCH-PROCESS-AUDIT.md). Mark unsupported
   questions `NOT-EVIDENCED`.

   Mark a missing freeze or denominator `UNAUDITABLE`; do not infer a historical cause.

5. Freeze the full audit outside Programme Supervisor visibility.

   Fill [AUDIT-RECOMMENDATION.md](assets/AUDIT-RECOMMENDATION.md) from its allowlisted fields only.

   It must declare `RAW_SECTION_CONTENT_INCLUDED: NO` and `AUTHORITY: RECOMMENDATION_ONLY`.

6. Return only that recommendation upward.

   The Programme Supervisor may later issue an independent `PROGRAMME_DECISION`.

   The auditor never writes state, admits a candidate, or enacts a transition.

## Deny-list

- Do not audit a live section update, live method proposal, or unbounded programme history.
- Do not act as the episode author, Programme Supervisor, or Section Director.
- Do not edit, correct, or rewrite evidence under audit.
- Do not treat an outcome as proof that process was sound, or a null as proof of broad failure.
- Do not collapse lenses into one score or claim causal failure from record shape.
- Do not claim independence from record shape.
- Do not emit a research transition, candidate admission, run intent, programme decision, or directive.
- Do not send the full `RESEARCH_PROCESS_AUDIT` to the Programme Supervisor.
- Do not send raw section material or a recommendation with a noncanonical field upward.

## Execution model

The modal audit is **solo, zero agents**: evidence interpretation and causal limits stay in one context.

A mechanical join may run before judgment. Independent refutation may inspect the frozen audit,
read-only, through `orchestrating-agents`. Only cited, frozen observables cross the boundary.

## Atomic verify

```bash
bun agents/skills/forging-skills/scripts/skill-check.ts agents/skills/auditing-research-processes
```

## MUST-NOT-FIRE

| Ask | Route |
|---|---|
| "The section is still running; tell the director what to try." | `directing-research-sections` |
| "Is this completed paper claim defensible?" | `arguing-research-papers` |
| "Why did the build hook fail?" | `operating-the-harness` or the implementation owner |
| "Choose which open issue a director should take." | `supervising-research-programmes` |
| "Invent a method for this research programme." | relevant section/search skill; not audit |

## References and shipped asset

| File | Covers | Read when |
|---|---|---|
| [audit-contract.md](references/audit-contract.md) | admission, roles, output and recommendation boundary | before any audit |
| [auditability-lenses.md](references/auditability-lenses.md) | lens meanings and evidence limits | while judging findings |
| [RESEARCH-PROCESS-AUDIT.md](assets/RESEARCH-PROCESS-AUDIT.md) | output schema | when writing the audit |
| [AUDIT-RECOMMENDATION.md](assets/AUDIT-RECOMMENDATION.md) | sole upward declassified return | when handing an audit upward |
| [triggers.md](tests/triggers.md) | fire/no-fire regression desk-check | after trigger edits |
| [forge-verification-ledger.md](tests/forge-verification-ledger.md) | F3 verification record | before freeze/reforge |
