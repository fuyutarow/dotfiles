---
name: surfacing-blind-spots
description: >-
  Exposes blind spots in ONE existing plan, frame, or decision artifact through typed premise
  perturbations, bounded tacit-knowledge elicitation, and an OPEN residual. Use for hidden assumptions,
  premise excavation, 思考盲点, 盲点を洗い出す, 暗黙の前提, unknown unknowns, `/dig`-style deep
  questioning, 水平思考で前提を揺さぶる, or premise-only audit before a selected-tree test. Emits
  one Blind-spot packet; never solutions or thesis candidates. Cuts: frame/program judgment →
  supervising-research-programmes; thesis genesis → forging-novel-theses; present fact inspection →
  raising-resolution; expensive/irreversible bet → acting-on-hypotheses; cheap reversible probe →
  domain/plain executor; corpus synthesis → systematizing-knowledge; paper appraisal →
  arguing-research-papers; skill craft → forging-skills; agent topology → orchestrating-agents.
  Human tacit answers remain HUMAN and are never simulated. English skill; respond in the user's
  language.
---

# Surfacing blind spots

> **Version**: v2607.2.0 (2026-07-30)
> **Scope**: premise excavation for one existing artifact. Output is a Blind-spot packet.

Build order (atomic). Verify:

```bash
for f in evidence boundaries; do test -f references/$f.md || echo MISSING $f; done; test -f scripts/blind-spot-check.ts || echo MISSING floor; test -f tests/triggers.md || echo MISSING triggers; test -f tests/forge-verification-ledger.md || echo MISSING ledger
```

## Language and stable tokens

Keep these identifiers unchanged even in Japanese output: **LAW**, **Blind-spot packet**,
**OBJECT**, **RELATION**, **OBSERVATION**, **REGIME**, **VALUE**, **ACTION**, and **OPEN**.
Also keep **LOAD-BEARING**, **UNELICITED**, and the three stop codes.

## THE LAW

> Unknown unknowns cannot be enumerated. Convert plausible hidden premises into explicit known
> unknowns through typed perturbations. When a real human owner is available, add bounded
> tacit-knowledge elicitation. Never simulate the human's answer. Preserve **OPEN** as an
> open-set residual; a finished packet is bounded work, never exhaustive reality coverage.

This skill does not brainstorm solutions, generate thesis candidates, or decide what to do.
It makes premises, missing decisions, and unresolved human knowledge visible for another owner.

## Entry gate

Proceed only when all are true:

1. exactly one existing plan, problem frame, or decision artifact is identifiable;
2. the decision at stake can be named;
3. a bounded search budget can be declared before questioning;
4. the requested output is premise excavation, not solution or thesis generation.

If no artifact exists, route construction to the owning sibling. Do not create an artifact merely
to make this skill fire.

## Typed breadth sweep

Give every surfaced assumption exactly one **Primary slot**. Add cross-tags only after choosing
that home. Sweep every slot once; if no premise surfaces in a slot, record `NONE SURFACED`
instead of inventing one.

| Primary slot | Perturbation |
|---|---|
| **OBJECT** | Change the unit, actor, boundary, identity, or omitted object. Ask what the artifact treats as the thing under study. |
| **RELATION** | Remove, reverse, mediate, or delay a causal, dependency, order, or coupling claim. |
| **OBSERVATION** | Challenge a measure, proxy, sample, missing datum, ignored anomaly, or silence treated as evidence. |
| **REGIME** | Move across scale, time, environment, distribution, failure mode, or boundary condition. |
| **VALUE** | Change whose success, harm, fairness, or trade-off defines “good enough.” |
| **ACTION** | Remove, delay, reverse, constrain, or make irreversible an intervention, sequence, fallback, or authority. |
| **OPEN** | Record plausible residue that has no justified primary type yet, including interactions among the other slots. Never call this exhaustive. |

Do not use **OPEN** as a shortcut for weak typing. Use it only when assigning another primary home
would claim more structure than the evidence supports.

### Transfer-artifact audit profile

For an existing transfer candidate or `MAPPING-BREAK`, sweep the recorded artifact without creating a
new map. **OBJECT** asks which donor/target roles or units were omitted. **RELATION** asks which claimed
invariant/correspondence is assumed. **REGIME** asks which precondition, scale, or precision-loss
boundary was omitted. **OBSERVATION** asks what target-side signal is present, missing, or `UNTESTED`.
The remaining slots retain their ordinary meaning. This packet may expose correspondence premises. It
must never propose or repair a correspondence, declare target truth, or design a test. Mapping belongs
to `forging-novel-theses`; target-side test/commit belongs to `acting-on-hypotheses`.

## Keep four axes separate

Record these as separate ledger columns. Never sum, multiply, rank, or collapse them into a
single risk or priority score.

| Axis | Allowed structural vocabulary | Question answered |
|---|---|---|
| **Evidence** | `ARTIFACT:<locus>` / `HUMAN:<owner>@<attestation-locus>` / `INFERENCE` / `NONE` | What supports the premise claim? |
| **Uncertainty** | `SUPPORTED` / `CONTESTED` / `UNKNOWN` / `UNELICITED` | What is unresolved about it? |
| **Frame damage** | `LOCAL` / `FRAME` / `DECISION` / `DISCRIMINATOR` | What breaks if it is false? |
| **Search cost** | `NOW` / `BOUNDED` / `EXTERNAL` / `INACCESSIBLE` | What would another answer cost? |

Select one to three **LOAD-BEARING** assumptions by considering all four axes in prose.
Do not let a cheap search masquerade as high consequence, or uncertainty masquerade as damage.

## Procedure

1. **Read before asking.** Read the artifact, its stated context, constraints, and available
   locators. Separate what it says from what you infer. Ask no question yet.
2. **Sweep once.** Apply all seven typed perturbations. Give each premise one primary slot and
   optional cross-tags. Preserve the **OPEN** residual.
3. **Choose depth.** Mark one to three assumptions **LOAD-BEARING** without a scalar score.
   Prefer assumptions whose falsity changes the frame, decision, or discriminator.
4. **Elicit only decision-changing tacit knowledge.** If a real human owner is available, ask
   one to three contrastive questions. Each question must state what different answers would
   change. Record the conversation/interview locator with the owner. Do not seed the question
   with model-generated solutions.
5. **Target tacit seams.** Probe ignored anomalies, unpublished failures, negative results, and
   expert workarounds. Also probe exceptions, institutional constraints, and dissent.
   If the human is not available, record `UNELICITED`; never invent the answer.
6. **Follow one answer at least two levels.** Trace the most consequential answer to the premise
   it exposes. Then trace that premise to its frame, decision, or discriminator consequence.
   If depth is blocked by unavailable human knowledge, mark both blocked levels `UNELICITED`.
7. **Integrate with provenance.** Update the ledger and record discoveries as
   `ARTIFACT:<locus>`, `HUMAN:<owner>@<attestation-locus>`, or `INFERENCE`. A locator makes the
   human claim auditable; it cannot prove authenticity. Do not upgrade inference into evidence.
8. **Hand off.** Name the owning sibling and the exact packet fields it should consume, or `NONE`.
9. **Stop strategically.** Use `DECISION-INSENSITIVE` when another answer cannot change the
   frame, decision, or discriminator. Use `BUDGET-SPENT` when the declared budget is exhausted.
   Use `HUMAN-UNAVAILABLE` when the next load-bearing branch requires an absent human.

## Blind-spot packet — the only output contract

Emit exactly one packet for the input artifact. Keep the field headings and stable tokens literal.

```markdown
## Object under review
[artifact and locator]

## Decision at stake
[decision that hidden premises could change]

## Search budget
[bounded questions / source passes / time or token cap]

## Assumption ledger
| ID | Primary slot | Assumption | Cross-tags | Evidence | Uncertainty | Frame damage | Search cost | Selection |
|---|---|---|---|---|---|---|---|---|
| A1 | OBJECT | [...] | RELATION | ARTIFACT:<locus> | UNKNOWN | FRAME | BOUNDED | LOAD-BEARING |
| A2 | OPEN | OPEN — [...] | NONE | INFERENCE | UNKNOWN | DECISION | EXTERNAL | NOT-SELECTED |

## Open-set residual
OPEN — NON-EXHAUSTIVE: [what the typed sweep still cannot claim to cover]

## Tacit-knowledge probes
| Probe | Target | Contrastive question | Provenance | Answer | Decision change |
|---|---|---|---|---|---|
| P1 | IGNORED-ANOMALY | [...] | HUMAN:<owner>@<attestation-locus> or UNELICITED | [...] or UNELICITED | [...] |

## Depth trace
- Root assumption: A1
- Level 1: HUMAN:<owner>@<attestation-locus> / ARTIFACT:<locus> / INFERENCE / UNELICITED — [...]
- Level 2: HUMAN:<owner>@<attestation-locus> / ARTIFACT:<locus> / INFERENCE / UNELICITED — [...]

## Discoveries
| Discovery | Source | Consequence |
|---|---|---|
| [...] | HUMAN:<owner>@<attestation-locus> / ARTIFACT:<locus> / INFERENCE | [...] |

## Handoff
[owner + fields to consume, or NONE]

## Stop reason
[DECISION-INSENSITIVE | BUDGET-SPENT | HUMAN-UNAVAILABLE] — [...]
```

Run `bun scripts/blind-spot-check.ts <packet.md>` or pipe the packet on stdin. A passing result
proves only typed coverage, explicit provenance, bounded depth, open residual, and strategic stop.
It does not prove creativity, completeness, importance, or truth.

## Deny list

Reject the packet before return if it:

- claims to enumerate or eliminate unknown unknowns.
- assigns multiple primary slots to one assumption.
- collapses evidence, uncertainty, frame damage, and search cost into one score.
- presents an agent-generated answer as human tacit knowledge.
- asks questions before reading the available artifact context.
- emits solutions, thesis candidates, experiment designs, or commit/kill decisions.
- continues questioning after no plausible answer can change the decision surface.

## Routing — typed sibling cuts

| Runtime question | Route |
|---|---|
| Are we constructing, selecting, or steering a research frame or program? | `supervising-research-programmes` |
| Are we generating structurally distinct thesis candidates for a selected frame? | `forging-novel-theses` |
| Are we inspecting whether a present fact, claim, or artifact is actually true? | `raising-resolution` |
| Are we testing one expensive/irreversible future bet or deciding commit, pivot, or kill? | `acting-on-hypotheses` |
| Is the decisive probe deterministic, cheap, bounded, and reversible? | domain/plain executor; return its result to the domain owner |
| Are we synthesizing a corpus into a field position? | `systematizing-knowledge` |
| Are we appraising or arguing a written paper's claim? | `arguing-research-papers` |
| Are we creating, auditing, or reforging a skill? | `forging-skills` |
| Are we assigning agent roles, visibility, topology, or acceptance authority? | `orchestrating-agents` |
| Are we excavating premises in one existing artifact without generating answers? | **HERE** |

`/dig` is a design input, not a sibling owner. This skill takes its context-first and
depth-following discipline, but owns only premise excavation. Lateral thesis generation stays
with `forging-novel-theses`. Detailed seams: `references/boundaries.md`.

## Execution model

The modal invocation is SOLO, zero agents. One context reads the artifact, selects
**LOAD-BEARING** assumptions, asks the human, and integrates the packet. Independent present-state
inspection may fan out read-only, but every return needs a locator. Agents cannot supply human
tacit evidence; correlated agent answers remain model output. No harness means the same map,
serial.

## Reference index

| File | Covers | Read when |
|---|---|---|
| `references/evidence.md` | source observations, design inferences, and limits for `/dig` and the creativity literature | evaluating why a rule exists or making an effectiveness claim |
| `references/boundaries.md` | SOLE detailed home of sibling cuts and handoff payloads | an ask could plausibly cross into another skill |
| `scripts/blind-spot-check.ts` | deterministic structural floor; not a semantic creativity test | after every packet and after checker edits |
| `tests/triggers.md` | fire / no-fire / co-fire desk-check | after any description or boundary edit |
| `tests/forge-verification-ledger.md` | source grades, forge decisions, red/green proof, and limits | auditing or reforging this skill |
