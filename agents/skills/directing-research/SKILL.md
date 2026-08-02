---
name: directing-research
description: >-
  Directs CREATIVE RESEARCH as a non-linear lifecycle. Entrypoint for 創造的な研究, research taste,
  研究テーマを見つける・選ぶ, 問いを立てる, research programme, 複数方向への配分, and 研究の舵取り.
  Owns STAGE DIAGNOSIS, problem-frame construction/selection/formulation, thesis-batch admission,
  transfer disposition, standing integrity, and portfolio steering across multiple bets. LAW: exposed premises,
  problem frames, candidate theses, and discriminating results CO-EVOLVE; generation freezes before
  evaluation, and results may reopen the problem. Cuts: one artifact's hidden premises →
  surfacing-blind-spots; corpus → systematizing-knowledge; present anomaly → raising-resolution;
  donor discovery → systematizing-knowledge; thesis genesis or target mapping → forging-novel-theses;
  one expensive/irreversible selected tree →
  acting-on-hypotheses; finished evidence → arguing-research-papers; agent topology/authority →
  orchestrating-agents. Leads the domain sequence; promises no creativity guarantee. English skill;
  answer in the user's language.
---

# Directing creative research

> **Version**: v2608.1.1 (2026-08-02) — frozen target-result reassessment and laundering gates hardened.

> **Scope**: the collection entrypoint and program-level judgment layer for creative research. It serves
> human researchers and research agents. It owns the lifecycle transitions and the research-problem /
> portfolio decisions; sibling skills own the moves performed at each transition.

> **Evidence boundary**: this is an evidence-informed operating synthesis, not a scientifically proven
> universal algorithm. The primary-source ledger and its limitations are in `references/sources.md`.

**Atomic build.** Keep the contract, floor, focused regressions, trigger matrix, and forge ledger in one
change. Verify:

```bash
for f in SKILL.md references/creative-research-loop.md references/selecting.md \
  references/formulating.md references/not-fooling-yourself.md references/steering.md \
  references/reconciliation.md references/sources.md scripts/research-check.ts \
  tests/research-check.test.ts tests/transfer-chain.test.ts tests/triggers.md \
  tests/forge-verification-ledger.md; do
  test -f "$f" || echo "MISSING $f"
done
```

## THE LAW — research is a coupled search, not a creativity recipe

> Creative research does not proceed once through `problem -> idea -> evaluation`. It maintains a
> coupled search over **exposed premises, problem frames, candidate theses, and discriminating
> observations**. Excavate the dominant frame before treating it as the search space; construct more
> than one problem frame; generate a batch without scoring it mid-stream; select on separate axes; test
> one selected tree; then let controls, failures, and surprises update the thesis **and the problem
> frame**. A result that cannot change either is not research steering.

Consequences:

1. **A received frame is not the search space.** Surface its hidden premises and open-set residual
   before constructing alternatives. This does not claim to enumerate unknown unknowns.
2. **A problem is constructed, not merely received.** An anomaly, stakeholder need, benchmark, or theory
   is raw material. State what relation or uncertainty makes it a research problem.
3. **Generation and evaluation are different verbs.** Generate, freeze, and deduplicate a batch before
   ranking it. Early criticism may narrow the search to the evaluator's existing taste.
4. **Novelty is not value.** Consequence, discriminability, feasibility, novelty, and bounded loss remain
   separate axes. Never collapse them into `impact × solvability × originality`.
5. **Execution is an admission test.** Proposal prose is not the endpoint. Controls, artifacts, and
   comparison with baselines may reverse the proposal-stage judgment.
6. **Unexpected results can reopen the frame.** They are not automatically discoveries; controls,
   alternatives, and follow-up must make them interpretable.

## One-home ownership contract

Read this table before acting. A braided ask may use several skills **in this order**; that is a
transition, not joint ownership.

| Input state / decision | Sole owner | Required handoff artifact |
|---|---|---|
| The relevant literature or field position is unclear; or donor relations must be found without mapping them to a target | `systematizing-knowledge` | bounded evidence position + uncertainties, or target-agnostic `DONOR SET` |
| One present dataset, source, code path, benchmark, or anomaly is unclear | `raising-resolution` | cited observation / anomaly packet |
| One existing plan/frame has hidden premises, tacit constraints, or unasked decisions | `surfacing-blind-spots` | blind-spot packet; no invented human answer |
| The current lifecycle stage is unclear; problems must be constructed, selected, formulated, or compared; a program must be steered | **HERE** | stage card + RESEARCH JUDGMENT SPEC |
| A problem/frame is selected but no thesis candidates exist; or a frozen `DONOR SET` must be mapped to that frame | `forging-novel-theses` | frozen candidate-thesis packets, or frozen transfer bundle containing `CANDIDATE` / `MAPPING-BREAK` attempts |
| One selected tree contains an expensive, irreversible, load-bearing forward bet | `acting-on-hypotheses` | Map / Loop / Leap artifacts |
| One selected tree has a cheap, deterministic, reversible probe | domain/plain executor | observed result with locus; return it here for update |
| Evidence is finished and one manuscript claim must be argued | `arguing-research-papers` | CLAIM SPEC |
| Roles, delegation, visibility, veto timing, verification, or acceptance must be designed | `orchestrating-agents` | orchestration contract; domain artifacts stay with their owner |
| Research documents need portfolio-wide admission, authority, evidence lineage, review, retirement, or deletion | `governing-research-documentation` | governed document lifecycle artifact |

**Cardinality + cost cut**: comparison, allocation, or reopening across **at least two independent
bets** is here. ONE tree goes to `acting-on-hypotheses` only when its hard gate fires for an expensive,
irreversible, load-bearing forward bet. If the decisive probe is cheaper to run than to map and plainly
reversible, use the domain/plain executor and return the observed result here. A single experiment's
pass/fail threshold is never duplicated here.

## Stage diagnosis — always emit this first

Name exactly one current stage and its evidence. If several stages are needed, name the earliest
unsatisfied dependency and route sequentially.

| Stage | Diagnostic | Next owner |
|---|---|---|
| `corpus-unclear` | the field state, novelty baseline, or target-agnostic donor relation is not bounded | `systematizing-knowledge` |
| `anomaly-unverified` | a present observation may be noise, leakage, or artifact | `raising-resolution` |
| `assumptions-unexposed` | one dominant frame exists but its premises/tacit constraints have not been excavated | `surfacing-blind-spots` |
| `problem-underconstructed` | the topic is broad, has no inherited frame, or has only one framing | **HERE** |
| `thesis-missing` | a selected problem exists but no distinct explanatory/prescriptive claim exists | `forging-novel-theses` |
| `candidate-selection` | a frozen candidate batch exists and must be admitted/ranked | **HERE** |
| `one-bet-untested` | one selected thesis needs discriminating action; cost/reversibility gate not yet applied | **HERE**, then `acting-on-hypotheses` or domain/plain executor |
| `program-steering` | results must reallocate or reopen at least two directions | **HERE** |
| `finished-claim` | the evidence is complete enough to argue in writing | `arguing-research-papers` |

## The creative-research loop

1. **GROUND** — obtain only the missing evidence state or present observation through the owning skill.
2. **EXPOSE OR BOOTSTRAP** — if a plan/frame exists, send that artifact to
   `surfacing-blind-spots`. If none exists, use grounded evidence from step 1 to state exactly one
   **PROVISIONAL-CONTROL** frame for construction—not an alternative slate and not an artifact invented
   merely to make another skill fire—then expose that artifact. Receive typed assumptions, a
   human-tacit probe record or `UNELICITED`, a two-level depth trace, an open-set residual, and a
   strategic stop reason. Do not simulate the human's answer.
3. **CONSTRUCT** — attempt a grounded control, a frame that breaks a load-bearing premise, and an
   orthogonal frame that changes another assumption type. Route names alone do not make frames distinct;
   their premise, decisive relation, or discriminator must differ. After one concrete construction
   attempt, a role may end as `COVERAGE GAP` only with the attempted transformation, a fixed
   fact/constraint, and why fabricating that frame would be illegitimate. A structural-transfer route is
   admitted here only as a program choice: route donor discovery to `systematizing-knowledge`, then map
   the frozen `DONOR SET` in `forging-novel-theses`. Do not construct the source-to-target map here.
4. **PROBE BEFORE NARROWING when needed** — if frame choice depends on what theses each frame makes
   expressible, select two or three frames **for an equal bounded probe**, call
   `forging-novel-theses` once per frame, and compare only after every probe returns. Each call still
   receives one selected-for-probe frame.
5. **FORMULATE** — for each surviving frame, state the decisive relation, the cheap victory, a held-out
   witness, and what the formalization discards.
6. **GENERATE** — hand one selected problem/frame to `forging-novel-theses`; receive candidate packets.
   For an admitted transfer route, receive its frozen bundle by path and SHA-256, including every
   `CANDIDATE` and `MAPPING-BREAK` attempt. Do not ask it to test, fund, or kill them.
7. **FREEZE + DEDUP** — stop generation, preserve the denominator, and merge semantic duplicates before
   any comparative score. If the survivors all share the same challenged premise, transformation
   target, or discriminator—or collapse below the declared floor—send exactly one coverage-gap
   regeneration request to `forging-novel-theses`. With multiple agents, blind initial generation is an
   orchestration choice.
8. **SELECT** — judge consequence, discriminability, feasibility, novelty delta, and bounded loss
   separately. Record the loser reasons. For a transfer bundle, sign a `TRANSFER DISPOSITION` that
   accounts for every attempt: `TEST`, `REOPEN`, `ADOPT`, or `RETIRE` for each candidate, and preserves
   every `MAPPING-BREAK`. Source-side success can motivate a route but cannot adopt or retire a target
   claim. When every attempt is a break, record `REOPEN` rather than manufacturing a candidate.
   Evaluator preference is evidence about the evaluator, not ground truth about idea quality.
9. **ACT ON ONE TREE** — apply the cost/reversibility hard gate. Send an expensive, irreversible,
   load-bearing thesis to `acting-on-hypotheses`; its outcome table and threshold are the sole home of
   per-test precommitment. Run an obvious cheap reversible probe through the domain/plain executor.
10. **UPDATE / REOPEN** — use the execution artifact, controls, and surprises to update the hypothesis
   tree, the problem frame, or the portfolio. A controlled surprise that no longer fits the selected
   frame returns to step 2; a frame-stable mechanism gap returns to step 6.

Operational detail and evidence crosswalk: `references/creative-research-loop.md`.

### Incubation is optional and human-only

For a **human** who has prepared the problem and reached an impasse, a bounded low-demand break can be
tried. Effects vary by task and study; it is neither mandatory nor a substitute for construction and
testing. Do not translate this into an agent instruction to sleep, idle, simulate a default-mode
network, or wait for inspiration. Agents instead diversify explicit generation routes and preserve
provenance.

## The gates — grep-able artifacts, not advice

| Gate | Decision owned here | Artifact |
|---|---|---|
| **D0 DIAGNOSE** | locate the earliest unsatisfied stage | **Stage diagnosis** with evidence and next owner |
| **D1 EXPOSE** | decide whether the received or provisional control is safe to construct from | returned **Blind-spot packet** + **Exploration allocation** pointing to its local `Search budget` |
| **D2 CONSTRUCT** | ensure the slate crosses premise boundaries, not labels, without inventing illegitimate frames | **Problem-frame slate** = CONTROL + attempted PREMISE-BREAK + attempted ORTHOGONAL; a role may be `COVERAGE GAP` only with an impossibility witness |
| **D3 ADMIT** | select without scalar-score laundering or Goodhart; disposition a frozen transfer bundle without turning donor success into target evidence | **Selection axes** kept separate + **The cheap victory** + **Optimize/trust firewall** + **Diversity-collapse rule** + **TRANSFER DISPOSITION** |
| **D4 GOVERN** | protect integrity across many runs | **Prediction-registry policy** + **Denominator policy** + **Independent-audit requirement**; actor assignment stays with `orchestrating-agents` |
| **D5 STEER** | allocate/reopen at program altitude | **Portfolio update** + **Reopen rule** |

`scripts/research-check.ts` is only a structural floor. It cannot decide whether a frame is important,
a witness is uncontaminated, or an auditor is truly independent.

## RESEARCH JUDGMENT SPEC

```markdown
# RESEARCH JUDGMENT SPEC: [programme / question]

- Stage diagnosis: [one stage token + evidence + next owner]
- Blind-spot packet: [locus + load-bearing assumptions + open-set residual + stop reason]
- Exploration allocation: [Blind-spot packet locus / SBS Search budget + cross-frame probe cap or NONE]
- Problem-frame slate: [CONTROL/slot/premise/discriminator; attempted PREMISE-BREAK/...; attempted ORTHOGONAL/...; honest COVERAGE GAP + impossibility witness where required]
- Selection axes: [consequence=...; discriminability=...; feasibility=...; novelty=...; bounded loss=...]
- The cheap victory: [how the apparent objective can be met without resolving the research problem]
- Optimize/trust firewall: [optimized metric=...; held-out witness never selected on=...]
- Diversity-collapse rule: [dedup trigger + one targeted coverage-gap regeneration + final stop]
- Prediction-registry policy: [registry or ledger locus + rule requiring registration BEFORE access/run]
- Denominator policy: [what counts as every generated candidate, run, seed, analysis, and exclusion]
- Independent-audit requirement: [required separation + frozen evidence surface + acceptance condition + actor assignment=orchestrating-agents]
- Portfolio update: [at least 2 independent bets and allocation, or explicit ONE-tree handoff]
- Reopen rule: [which unexpected controlled result reopens the problem frame or diagnosed stage]

## TRANSFER DISPOSITION

- Transfer bundle: [NONE — reason, or path=<frozen bundle locus>; sha256=<digest>]
- Attempt denominator: [NONE, or every transfer attempt ID from the frozen bundle]
- Candidate disposition: [NONE — reason, or `ID=TEST|REOPEN|ADOPT|RETIRE; ...`]
- Preserved MAPPING-BREAK IDs: [NONE — reason, or every break ID]
- Basis / scope: [why this program admits, reopens, adopts, or retires the transfer route]
- Target-side test or result locus: [NONE — reason; `UNTESTED — prediction registry=...; handoff=...`; or `TARGET RESULT — path=<frozen result>; sha256=<digest>`]
- Integration / retirement action: [what remains live, or `REOPEN — ...` when every attempt broke]
- Reopen trigger: [which target-side result reopens donor search or the target frame]
```

Run: `bun scripts/research-check.ts <spec.md>`. For an active frozen bundle, pass the frozen donor set
and transfer bundle together:
`bun scripts/research-check.ts --donor-set <donor-set.md> --transfer-bundle <bundle.md> <spec.md>`.
For `ADOPT` or `RETIRE`, also pass `--target-result <target-result.md>`. Its path and SHA-256 must
match the declaration. Its own transfer-bundle path/SHA, candidate ID, target observation, prewritten
non-vacuous numeric threshold, exact target-only observation locus, threshold result, mapping-assessment
request, and break-preserving handoff are rechecked. The floor rejects donor IDs, donor/source success,
reuse of a donor source identity at another anchor, and mechanically contradictory numeric verdicts.
`ADOPT` additionally requires a `PASS` result and `Mapping assessment request: NONE`; an unresolved
correspondence request must return to `forging-novel-theses` before adoption.
The `path=` declaration and each CLI argument resolve to their respective frozen artifacts; SHA-256 is a
second, independent freeze check. For example:

```text
- Transfer bundle: path=research/transfer-bundle.md; sha256=<64 lowercase hex>
```

```bash
bun scripts/research-check.ts --donor-set research/donor-set.md \
  --transfer-bundle research/transfer-bundle.md research/judgment.md
```

## Selection and steering rules

- **Consequence before tractability**: first state what becomes possible or falsified. Then ask whether a
  fresh tool, datum, access path, or conceptual lever makes the problem attackable now.
- **No novelty monoculture**: keep a conventional grounding and a bounded atypical probe. Distance of an
  analogy is not a quality signal. A transfer candidate needs a target-side prediction and alternative
  discriminator; donor success is not target-side support.
- **No premise monoculture**: a control and a premise-breaking frame must coexist long enough to compare.
  A list of different route names that shares one ontology, causal direction, proxy, and regime is one
  frame family.
- **No pretend elicitation**: when the researcher's tacit context is load-bearing, use the answer returned
  by `surfacing-blind-spots` or record `UNELICITED`; an agent-authored “expert intuition” is counterfeit.
- **No feasibility monoculture**: feasibility-heavy selection can discard original candidates. Preserve
  the separate-axis record and compare proposal-stage judgment with execution-stage evidence.
- **No all-in inference**: evidence that risky work sometimes has high upside does not justify putting
  all resources into it. State the safe core, bounded probe, and loss cap.
- **Direction-level kill**: retire only the tested family's supported closure. Flat learning caused by
  an access or measurement block is not evidence that the scientific space is empty.

Problem construction and selection details: `references/selecting.md`. Metric and witness design:
`references/formulating.md`. Standing integrity: `references/not-fooling-yourself.md`. Portfolio update:
`references/steering.md`.

## MUST-NOT-FIRE

| Ask | Route |
|---|---|
| “What do these 60 papers establish?” | `systematizing-knowledge` |
| “Find donor relations in adjacent fields, but do not map them to my target yet.” | `systematizing-knowledge` |
| “Is this residual real or a pipeline artifact?” | `raising-resolution` |
| “Interrogate this existing plan for hidden premises; do not propose solutions yet.” | `surfacing-blind-spots` |
| “Given this problem, invent several novel theses.” | `forging-novel-theses` |
| “Map this frozen donor relation to the selected target and report where the map breaks.” | `forging-novel-theses` |
| “Here is one expensive or irreversible thesis; precommit its cheapest discriminating kill experiment.” | `acting-on-hypotheses` |
| “This deterministic check takes 30 seconds and is reversible; run it.” | domain/plain executor, then return the result here |
| “Turn these completed results into one defensible paper claim.” | `arguing-research-papers` |
| “Who should generate, criticize, verify, and accept, and when?” | `orchestrating-agents` |
| “Which research documents should exist, be authoritative, be reviewed, or be retired?” | `governing-research-documentation` |
| “Give me daily habits for feeling imaginative, unrelated to a research decision.” | outside this family; answer directly or use an appropriate human-practice source |

**Broad asks fire HERE**: “どうすれば創造的な研究ができる?”, “help me plan and run this research
programme”, and asks braided across problem finding, ideation, experiments, and steering. Diagnose first;
then route the moves instead of reenacting them here.

## Orchestration seam

Research content and agent control are orthogonal:

- **HERE / siblings** decide the problem frames, candidate schema, admission criteria, test meaning, and
  research verdict.
- `orchestrating-agents` decides who sees what, when critique begins, what can run in parallel, who may
  veto, and how acceptance is recorded.

For a multi-agent run, freeze the domain sequence first: `directing-research ->
surfacing-blind-spots -> directing-research -> [systematizing-knowledge -> forging-novel-theses for an
admitted transfer route | forging-novel-theses] -> directing-research -> [acting-on-hypotheses |
domain/plain executor] -> directing-research`. Then let
`orchestrating-agents` assign roles around that sequence. More agents are not evidence of more ideas or
better research.

## Reference index

| File | Load when |
|---|---|
| `references/creative-research-loop.md` | running or explaining the full creative-research lifecycle |
| `references/selecting.md` | constructing, comparing, and selecting problem frames |
| `references/formulating.md` | closing cheap victories and separating optimized metric from trusted witness |
| `references/not-fooling-yourself.md` | defining the standing registry, denominator, and independent-audit policy |
| `references/steering.md` | updating a portfolio across at least two independent directions |
| `references/reconciliation.md` | resolving scoped tensions without universal slogans |
| `references/sources.md` | checking provenance, limitations, rejected universal claims, or research gaps |
| `scripts/research-check.ts` | validating a RESEARCH JUDGMENT SPEC and its active frozen transfer chain |
| `tests/research-check.test.ts` | changing validator behavior or its fail-closed transfer gates |
| `tests/transfer-chain.test.ts` | validating the DONOR SET → FNT bundle → director disposition integration |
| `tests/triggers.md` | changing any description or sibling boundary |
| `tests/forge-verification-ledger.md` | auditing this reforge and its unresolved evidence limits |
