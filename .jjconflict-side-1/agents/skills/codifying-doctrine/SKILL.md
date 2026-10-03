---
name: codifying-doctrine
description: >-
  Codifies and audits a DOCTRINE — the ordered trade-off rules that let distributed actors decide
  alike when nobody can confer. Use for ドクトリン, 行動指針, 判断基準, 行動規範, operating
  principles, leadership principles, 優先順位, tie-break, 「A と B が衝突したらどちらを取るか」,
  権限委任の境界, 「指示が届かないときの既定動作」, doctrine audit, 原則が形骸化している,
  values-on-the-wall, or a worldbuilding faction's doctrine. LAW: each rule names what it
  SACRIFICES (A > B), the regime it holds in, the surface that makes deviating visible, the
  deviation it logs, and the observable that retires it; a rule that never reversed a real
  decision is decoration; agreement is MEASURED by a blind divergence probe, never asserted.
  MUST-NOT-FIRE on a one-off decision, a settled procedure (SOP/runbook), or a universally-bad act
  — doctrine is steering, not a guardrail. Cuts: WHERE a rule installs and how the harness
  enforces it → operating-the-harness (CO-FIRES); a task manual for one executor →
  forging-skills, which owns this file's own craft; applying a risk-calibrated code discipline →
  practicing-tiger-style; agent dispatch → orchestrating-agents; reordering a doc whose rules are
  settled → structuring-documents; a paper corpus first → systematizing-knowledge.
  Workflow-native: the divergence probe and case verification fan out; naming the sacrifice, the
  precedence order, and the final text stay SOLO — WHICH value to give up is the user's call,
  never the model's. English skill; respond in the user's language (default Japanese).
---

# Codifying doctrine — the tie-break that survives the partition

> **Version**: v2608.1.0 (2026-08-08) — forged from a 13-lens survey; sources, grades, and myth
> corrections live in `references/canon.md`. F3 artifacts: `tests/triggers.md`, `tests/forge-verification-ledger.md`.

Run from this skill directory; success prints nothing:

```bash
for f in deriving binding testing canon; do test -f "references/$f.md" || echo "MISSING references/$f.md"; done
for f in scripts/doctrine-check.ts tests/triggers.md tests/forge-verification-ledger.md; do test -f "$f" || echo "MISSING $f"; done
:
```

## Language and stable tokens

English body; write the deliverable in the user's language. These identifiers stay fixed even
inside Japanese prose — translating one forks the concept:

```text
DOCTRINE | SACRIFICE | REGIME | RULE | STANDARD | BINDING | ADVISORY
BINDING SURFACE | DEVIATION LOG | ADVANCE NON-COMPLIANCE | DIVERGENCE PROBE
RETIREMENT TRIGGER | CUSTODIAN | 願望 (aspiration, the demoted tier)
```

## THE LAW

> A doctrine is not what you value. It is **what you give up**, fixed before the situation
> arrives, so that actors who cannot confer still decide alike.
>
> Agreement cannot be manufactured by messaging. Guaranteed common knowledge over an unreliable
> channel is impossible. The whole investment therefore sits BEFORE the partition, in a shared
> prior that has been rehearsed. Adding meetings to a divergence problem is the characteristic
> wrong move.
>
> Every rule names five things. The value it defeats. The regime it holds in. The surface that
> makes deviating visible. The deviation it prints and logs. The observable that retires it.
> **A rule that has never reversed a real decision is decoration.** Agreement is MEASURED, never
> asserted. And a doctrine that cannot be wrong cannot be revised, which is how the strongest
> ones lose.

Three consequences that change what you write:

1. **Authoritative and non-prescriptive are compatible.** The canonical definition calls doctrine
   authoritative while requiring judgment in application. Do not read "requires judgment" as
   "optional." Loci and wording: `references/canon.md` §3.
2. **Deviation is printed inside the doctrine, not forbidden.** Mature doctrine prints its own
   exception clause and closes deviation with a REPORT duty. A doctrine with no legitimate
   deviation path gets deviated from silently.
3. **Name-without-a-document is the dominant public failure.** Before treating any named
   "doctrine" as a decision rule, locate the promulgated text. If none exists, label it a
   construct. `references/canon.md` §4 carries the worked cases.

## STEP 0 — the existence gate (run before anything else)

A doctrine is **steering**, not a guardrail. Answer in writing:

> Is there a **recurring** conflict between **two values the organization would defend**?
> Do **different actors currently resolve it differently**?
> Must they resolve it **without conferring**?

| Answer | Route — do NOT write a doctrine |
|---|---|
| It is one decision, not a class | decide it; record the decision, not a rule |
| Everyone already agrees on the ordering | write it as one line and stop; no machinery |
| The losing option is universally bad | that is a guardrail / anti-pattern, not a doctrine |
| A settled sequence of steps exists | SOP, checklist, runbook — `forging-skills` if it is an agent manual |
| The conflict is resolvable by asking | fix the channel; doctrine is for when you cannot ask |
| It is about where a rule installs in the harness | `operating-the-harness` |

Only a YES to all three earns the gates below. **Over-firing is the model's dominant failure
here.** An eight-principle doctrine for a two-person project is this skill failing.

## Gates — each leaves a grep-able artifact

The artifact may be a durable file or an explicit table in the response. Do not create files to
satisfy a name. **No artifact means the gate is not passed.**

| Gate | Question | Required artifact |
|---|---|---|
| **D1 SACRIFICE** | What does each rule give up, and would anyone defend the thing given up? | trade-off table with a `defeated value` column, one row per rule, each row in the form `A > B`; rules failing the negation test are demoted to 最低基準 or cut |
| **D2 REGIME** | In what environment does this rule hold, and what observable would show that environment has ended? | `regime` + `retirement trigger` + `custodian` + `review-by` columns; the trigger names an EXTERNAL condition, never a calendar alone |
| **D3 FORM** | Can an actor resolve this clause from its text BEFORE acting, or only afterwards via an adjudicator? | `form` column tagged RULE / STANDARD, plus a `binding` column tagged BINDING / ADVISORY; a clause worded as a rule but settled after the fact is relabeled |
| **D4 GROUNDING** | Which real, dated past decision would this rule have decided — and which one would it have REVERSED? | counter-preference case log: `rule / date / the competing preference / what was sacrificed / who signed`. A rule with no reversal case ships labeled **願望**, not doctrine |
| **D5 BINDING** | What makes deviating costly or visible, other than the sentence itself? | `binding surface` column naming one of the four types (`references/binding.md` §1), a hook/gate, or the literal token ADVISORY |
| **D6 DEVIATION** | Where does a legitimate deviation go, and what is declared non-compliant in advance? | printed exception clause + report duty + DEVIATION LOG with a disposition column + ADVANCE NON-COMPLIANCE section listing rules knowingly not followed, with reasons |
| **D7 CONVERGENCE** | Do independent actors given the same dilemma actually decide alike? | DIVERGENCE PROBE: ≥5 dilemmas, issued blind and independently, decisions collected BEFORE comparison, divergence reported as a count with the diverging rows named |

Gate order is the authoring order. D7 runs last and is the only gate that can fail the whole
draft. **A doctrine that has not been probed is untested, not agreed.**

## Pipeline

1. **Run STEP 0.** If it fails, deliver the route, not a doctrine.
2. **Mine decided cases before writing any rule.** Derive the doctrine from what the organization
   already did under pressure. Incidents, reverted decisions, arguments that recurred.
   Inventing the trade-off from taste is the model's second dominant failure.
   → `references/deriving.md` §1–2
3. **Derive the REGIME from the actual constraint.** Scarce people, no comms, adversary
   adaptation, unbounded context. The rule that follows is the one that survives that constraint.
   → `references/deriving.md` §3
4. **Write each rule as `A > B` and run the negation test.** If nobody would seriously propose
   the negation, it carries no information. → `references/deriving.md` §4
5. **Choose RULE or STANDARD by frequency and homogeneity**, not by topic salience. Frequent and
   homogeneous → bright-line RULE; rare and heterogeneous → STANDARD with a named adjudicator.
   → `references/deriving.md` §5
6. **Attach a BINDING SURFACE to each rule, or label it ADVISORY out loud.**
   → `references/binding.md` §1
7. **Write the precedence order and the same-rank tie-break.** Cross-rank conflict resolves by
   rank; same-rank by a pre-committed fallback. Never publish two co-equal top priorities.
   → `references/binding.md` §2
8. **Write the delegation boundary and the default action on silence.** `IF no contact by T THEN
   X`. Declare per decision class whether the fallback is FREEZE or ACT-ON-LAST-INTENT.
   → `references/binding.md` §3
9. **Write the deviation machinery**: exception clause, report duty, log, and the ADVANCE
   NON-COMPLIANCE list. → `references/binding.md` §4
10. **Cap and type the set.** Every addition forces a merge or a retirement. → `references/deriving.md` §6
11. **Run the DIVERGENCE PROBE and the audit checklist.** → `references/testing.md`
12. **Ship with front matter**: custodian, review-by, version, and the retirement triggers.

Run `bun scripts/doctrine-check.ts <file>` before any semantic review. It is a floor, not a judge.

## Execution model

Evidence type is **DIVERGENCE-PROBE**, and its asymmetry is the whole point:

> **Divergence is a hard signal; agreement is a weak one.** Independent agents given the same
> dilemma are CORRELATED readers. Their agreement OVERSTATES what humans would reach. A divergence
> found means the rule is underdetermined, so act on it. No divergence found means
> untested-so-far, and must be reported in those words.

| Stage | Mode | Why |
|---|---|---|
| STEP 0, choosing WHICH value to sacrifice | **HUMAN** | constitutionally the user's call; a model that picks the sacrifice has invented the organization's preferences |
| Mining decided cases from repos/logs/incidents | FAN-OUT | independent reads over disjoint sources; each returns cases with loci |
| Writing rules, precedence, tie-break, final text | **SOLO** | an ordering assembled from shards is not an ordering |
| DIVERGENCE PROBE | FAN-OUT, blind | one agent per dilemma, no shared context, decisions collected before comparison; shared context destroys the measurement |
| Verifying each counter-preference case is real | FAN-OUT, read-only | one agent per case, refutation-first |
| Adjudicating divergence, fixing the draft | SOLO | fixes braid across rules |

Trust boundary: an agent's returned decision is admitted only with the dilemma id and its stated
reason. A returned "this doctrine is clear" is an opinion, not a probe result.
**No harness → the same map, serial.** Issue the dilemmas to yourself in separate focused passes,
writing each decision down before reading the next.

Durable operating guidance from a frontier model (2026-08) to whatever model executes this later.
It encodes failures observed in production and in the source record. *If a constraint here feels
unnecessary, that feeling is the failure mode — follow the map.*

## MUST-NOT-FIRE — and where it goes instead

| Ask | Route |
|---|---|
| "Should we use Postgres or SQLite here?" | one decision — just decide it |
| 「デプロイ手順をまとめて」 / a runbook, checklist, SOP | a procedure, not a tie-break; `forging-skills` if it is an agent manual |
| "add a rule: never force-push to main" | universally-bad act = guardrail; `operating-the-harness` for the hook |
| "why isn't my CLAUDE.md rule being followed?" | `operating-the-harness` — enforcement mechanics |
| "write our company values page for the careers site" | marketing copy; `linting-prose` — unless the user wants it to BIND, then STEP 0 |
| "review this PR against our coding standards" | applying an existing discipline; `practicing-tiger-style` for risk-calibrated code |
| "reorder the sections of our engineering handbook" | `structuring-documents` — rules already settled |
| "what does the Powell Doctrine say?" | a factual question — answer it, applying `references/canon.md` §3's name-without-a-document check silently |
| "summarize what military doctrine is" | answer directly; ceremony on an explainer is this skill failing |
| "run these 5 agents and check their output" | `orchestrating-agents` |

## Routing — typed sibling cuts

| Sibling | Cut (runtime-answerable) |
|---|---|
| `operating-the-harness` | **PURPOSE** — "Is the question WHERE this rule installs and how the harness enforces it, or WHETHER it is a binding trade-off at all?" Hooks, settings, scope, listing → there. Whether the rule sacrifices anything, what retires it, whether it converges → here. **CO-FIRES**: authored here, installed there. That skill's config-as-prose anti-pattern is this skill's D5. |
| `forging-skills` | **CARDINALITY/PURPOSE** — "Is the artifact a task manual loaded by ONE executor for ONE class of task, or the tie-break that governs actors ACROSS tasks when no procedure covers the case?" Manual → there. Tie-break → here. That skill is also the craft owner of THIS file: reforging `codifying-doctrine/SKILL.md` fires `forging-skills`, not this. |
| `practicing-tiger-style` | **PURPOSE** — "Is the request to APPLY a risk-calibrated code discipline, or to AUTHOR/AUDIT the trade-off set itself?" That skill is a worked doctrine INSTANCE; this skill is the craft. Apply → there. Author or audit → here. |
| `orchestrating-agents` | **PURPOSE** — dispatch, briefing, visibility, acceptance, resource admission → there. The priority ordering the dispatched actors carry when the brief runs out → here. Co-fire when a doctrine's probe needs a fleet. |
| `structuring-documents` | **FIX-LOCALITY** — the rules and their ordering are still in dispute → here; the rules are settled and the document needs partition, dedupe, or reordering → there. |
| `systematizing-knowledge` | **SEQUENCE** — a doctrine derived from a literature corpus runs as an SoK FIRST (coverage, claim ledger, reconciliation); only the signed position distills into rules here. Never rule-ify an unreconciled corpus. |
| `surfacing-blind-spots` | **CO-FIRE** — auditing the doctrine's UNSTATED premises (what regime it silently assumes) is theirs; the stated REGIME column is D2 here. |
| `acting-on-hypotheses` | **PURPOSE** — adopting a doctrine as one expensive, hard-to-reverse organizational bet with a discriminating test → there. Authoring and auditing the artifact → here. |
| `governing-research-documentation` | **SEQUENCE** — the doctrine is signed here first; admission, authority, and lifecycle across a document portfolio follow there. |

The complete fire/no-fire regression set is `tests/triggers.md`.

## Reference index — load only the branch in use

| File | Sole ownership | Read when |
|---|---|---|
| `references/deriving.md` | STEP 0 detail, mining decided cases, regime derivation, the negation test, RULE-vs-STANDARD choice, set size and typing, elicitation interview | pipeline steps 1–5, 10; any new rule |
| `references/binding.md` | the four BINDING SURFACE types, precedence and same-rank tie-break, delegation boundary and default-on-silence, deviation machinery and ADVANCE NON-COMPLIANCE | pipeline steps 6–9; "how do we make this actually bind?" |
| `references/testing.md` | DIVERGENCE PROBE protocol, the 12 observable tells of a decorative doctrine, red-team lenses, audit of an existing doctrine | pipeline step 11; auditing someone else's doctrine |
| `references/canon.md` | dated source ledger with grades, the worked doctrine shapes worth copying, and the myth corrections (name-without-a-document cases, laundered numbers, untraceable quotes) | citing any real doctrine; verifying a claim about one; reforging this skill |
| `scripts/doctrine-check.ts` | non-semantic floor over a doctrine draft: `A > B` shape, required columns, unfalsifiable-value words, set size, missing custodian/review-by | before any semantic review; after editing a doctrine file |
| `tests/triggers.md` | fire / no-fire / co-fire desk-check set | after any description edit |
| `tests/forge-verification-ledger.md` | source grades, audit findings, red/green receipts, maintenance triggers | auditing or reforging this skill |

## Exit conditions

Deliver only when D1–D6 artifacts exist and D7 has actually been run. State the divergence result
plainly, including "no divergence found on N dilemmas — untested beyond these." A doctrine shipped
with rules honestly labeled 願望 is complete. One that claims agreement it never measured is not.
