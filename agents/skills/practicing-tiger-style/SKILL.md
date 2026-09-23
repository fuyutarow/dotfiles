---
name: practicing-tiger-style
description: >-
  Applies Tiger Style to consequential architecture, code, and review.
  Use for Tigerレビュー, architecture/アーキテクチャ設計 with resource limits/資源上限,
  state ownership/状態所有権, concurrency/並行処理, durable state/永続化, failure recovery,
  costly R&D, or prototype-to-production/試作から本番化. Links design decisions to
  contracts, negative cases, checks, and exceptions in one ledger.
  Explicit Tiger design starts before code; low-risk sketches need no release ledger.
  PURPOSE: constraints here; general decomposition stays with the task owner.
  Bug/change → implementing-and-debugging first; structure-only → refactoring-code;
  untested costly bet → acting-on-hypotheses first; language mechanisms → writing-*.
  History/survey → answer/systematizing-knowledge; SKILL.md craft → forging-skills.
  Workflow-native: design, tier, exceptions, acceptance SOLO; facts may fan out.
  English skill; respond in the user's language.
---

# Practicing Tiger Style

> **Version**: v2609.1.0 (2026-09-23) — architecture decisions through implementation checks.
> Source synthesis and derivation: `references/source-ledger.md`.

Run from this skill directory:

```sh
for f in source-ledger evidence-and-limits architecture-decisions ledger-and-calibration rd-and-language-translation execution-model; do test -f references/$f.md || echo MISSING $f; done
test -f agents/openai.yaml && test -f tests/triggers.md && test -f tests/forge-verification-ledger.md
bun ../forging-skills/scripts/skill-check.ts .
```

## Language

Respond in the user's language. Keep **LAW**, **T0–T4**, **Tiger conformance ledger**,
**positive space**, **negative space**, **SOLO**, **PASS**, and **STOP** stable.

## LAW — architecture decisions must reach checks

> Start with workload, state, resources, and failure consequences.
> Link each material design decision to a contract and a check at the boundary that enforces it.
> Keep one Tiger conformance ledger; do not certify reliability from slogans or assertion counts.

Own the Tiger constraints and their verification, including architecture decisions within that ledger.
Use the task's existing design document as its location when available.
A small task may keep the ledger inline; do not create documents merely to satisfy names.

```text
workload + existing/proposed design
  → select consequential architecture constraints
  → Tiger conformance ledger: design decisions + obligations + evidence
  → implementation handoff or bounded review findings
```

The ledger is skill-supplied, not an official TigerBeetle artifact.
TigerBeetle's database topology is a source example, not a required target architecture.
General domain decomposition and deployment selection remain with the task's design owner.

## Choose the entry point

| Input | First action | Output boundary |
|---|---|---|
| Explicit Tiger architecture/design request; no code yet | Sketch T0 with estimates and open assumptions | Design constraints and planned checks; no implementation PASS |
| Bug, performance regression, or behavior change | Let `implementing-and-debugging` establish intent and cause | Add Tiger constraints to the selected repair |
| Retained component, durable service, or costly experiment | Inspect the affected path, then T0–T4 | Scoped ledger and evidence |
| Disposable low-risk sketch | Use the domain's cheap execution checks | No release ledger or invented exception ceremony |
| Rules/history/survey only | Answer or use `systematizing-knowledge` | No conformance assessment |

An explicit design request may use a provisional workload; mark assumptions rather than guessing limits.
Missing evidence prevents acceptance, not safe design work or a reversible implementation probe.
Keep read-only reviews read-only unless changes were requested.

## Gates — one ledger, one decision chain

| Gate | Required result | What remains open if absent |
|---|---|---|
| **T0 DESIGN** | Workload, affected components/state, boundaries, selected trade-offs | Design recommendation is provisional |
| **T1 CONSEQUENCE** | Risk tier, concrete failure mode, why it matters now | No trusted-use assessment |
| **T2 OBLIGATION** | Invariant, negative case, bound, handling, evidence plan, owner | Affected contract is incomplete |
| **T3 REVERSAL** | Specific exception, compensating measure, owner, expiry/reversal | No acceptance of that exception |
| **T4 EXTERNAL CHECK** | Observed result at a relevant implementation or consumer boundary | Planned checks cannot become PASS |

T0 is proportional: one existing component can need only a sentence and its code locus.
Cross-component state, capacity, or failure paths require
[architecture-decisions.md](references/architecture-decisions.md) before detailed assertions.

Read [ledger-and-calibration.md](references/ledger-and-calibration.md) to fill and close T1–T4.
It owns the schema, risk tiers, error classes, exception policy, and acceptance conditions.

## Architecture to implementation

1. Inspect or sketch the component and data flow with mutable-state owners.
2. Select only decisions affecting the named loss or requested design objective.
3. For each decision, name its enforcement boundary and the rejected alternative.
4. Connect that decision to T2 rows and implementation/test loci.
5. Exercise normal, overload, cancellation, replay, or recovery cases as applicable.
6. Report open assumptions, observed checks, and the scope of the resulting decision.

If a component's limit moves work elsewhere, account for the downstream queue and retry path.
If a local assertion passes but an end-to-end invariant fails, reopen the design decision.
Do not add assertion quotas to compensate for an unresolved ownership or recovery protocol.

## Source claims and portability

Read [source-ledger.md](references/source-ledger.md) before calling a rule official or universally required.
For asserted official rules, use its **SOURCE CLAIM CHECK** before applicability advice.
That reference owns the exact eight-column output contract and its receipt.

Keep source prescription, observed result, and this skill's adaptation distinct.
Never transplant single-threading, startup-only allocation, replica counts, or dependency bans by name alone.
Use [evidence-and-limits.md](references/evidence-and-limits.md) for effect claims and coverage limits.
No improvement in coding-agent correctness, speed, or safety is established by this skill.

## Research and language handoff

Use [rd-and-language-translation.md](references/rd-and-language-translation.md) at promotion boundaries.
Retain exploration freedom; harden the boundary whose output or cost is now relied on.
Language mechanisms belong to `writing-rust`, `writing-julia`, or the applicable platform skill.
Preserve their idioms instead of translating a database rule literally.

## Execution model — scoped observable evidence

Keep design choices, tier, exceptions, and acceptance **SOLO**.
Independent facts may be collected read-only with source or command loci.
Agent agreement cannot establish an invariant or an effect on LLM quality.
Delegation details live in [execution-model.md](references/execution-model.md).
No harness → same map, serial.

## MUST-NOT-FIRE and sibling cuts

| Question | Owner and handoff |
|---|---|
| Explicit Tiger design, or consequential architecture constraints? | Here: T0 decisions and their ledger links. General decomposition stays with the task owner. |
| Merely pick layers, services, frameworks, or a deployment topology? | Task/domain owner. Co-fire here only for requested Tiger constraints or material failure exposure. |
| Root cause, feature, performance, or other observable change? | `implementing-and-debugging` first; this skill adds the risk ledger. |
| Behavior-preserving structural change? | `refactoring-code`; co-fire for consequential boundary review only. |
| Configuration authority, representation, or integrity? | `governing-configuration-systems`; this ledger links to its contract. |
| Untested expensive or hard-to-reverse bet? | `acting-on-hypotheses` first; this skill guards experiment integrity afterward. |
| Cross-actor priorities and delegated authority? | `codifying-doctrine`; do not turn one system's ledger into an organization-wide doctrine. |
| Agent fleet CPU/RAM/VRAM admission? | `orchestrating-agents`; application capacity remains here. |
| Language syntax, tooling, or type-system mechanism alone? | Language/platform owner; no Tiger ceremony. |
| Source corpus or research claim? | `systematizing-knowledge`; no raw-corpus skillification. |
| Skill reorganization, description, or tests? | `forging-skills` owns craft. |

Do not fire on a typo, cosmetic formatting, generic benchmark, or a bare TigerStyle mention.
These are PURPOSE cuts; preserve existing reciprocal seams in substance, not byte identity.

## Reference index

| File | Covers | Read when |
|---|---|---|
| [architecture-decisions.md](references/architecture-decisions.md) | T0 decision map, alternatives, design-to-check links | Architecture request or cross-component consequence |
| [ledger-and-calibration.md](references/ledger-and-calibration.md) | T1–T4 schema, tiers, errors, exceptions, acceptance | Constructing or closing a ledger |
| [source-ledger.md](references/source-ledger.md) | SoK lineage, grades, pinned loci, official-rule check | Attribution or portability claim |
| [evidence-and-limits.md](references/evidence-and-limits.md) | Evidence boundary and revalidation | Effect or universality claim |
| [rd-and-language-translation.md](references/rd-and-language-translation.md) | Promotion and language handoff | Research stage or language adaptation |
| [execution-model.md](references/execution-model.md) | Delegation schema and trust boundary | Independent fact collection |
| [triggers.md](tests/triggers.md) | Trigger and behavior cases | Description or workflow change |
| [forge-verification-ledger.md](tests/forge-verification-ledger.md) | Spec, findings, checks, historical receipts | Reforge and acceptance review |
