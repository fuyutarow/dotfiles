---
name: directing-research
description: >-
  Directs CREATIVE RESEARCH: stage diagnosis, problem-frame construction/selection/formulation,
  thesis admission, transfer disposition, standing integrity; multi-bet steering; RESEARCH PROCESS
  POSTMORTEM. Use for 創造的な研究, 研究問題/研究課題の解像度・具体化・定式化, and 研究の舵取り.
  Postmortem: frozen RUN INTENT/terminal RUN RECEIPT→RETROSPECTIVE JUDGMENT + RESEARCH JUDGMENT SPEC
  update; missing history=PARTIAL/UNAUDITABLE. Cuts: premises→surfacing-blind-spots;
  corpus/donors→systematizing-knowledge; fact→raising-resolution (silent cited row only);
  thesis/mapping→forging-novel-theses; expensive tree→acting-on-hypotheses; finished
  claim→arguing-research-papers; topology/dispatch review→orchestrating-agents;
  docs→governing-research-documentation; transport→continuing-long-running-tasks; generic software
  incident/postmortem→implementing-and-debugging. Bare 「研究を進めて」 starts here; orchestration
  follows a signed domain map. No creativity guarantee. English; respond in user language.
---

# Directing creative research

> **Version**: v2608.2.1 (2026-08-02) — research-run tooling integrated; two-axis judgment clarified.

> **Scope**: the collection entrypoint and program-level judgment layer for creative research. It serves
> human researchers and research agents. It owns lifecycle transitions and research-problem or
> portfolio decisions. Sibling skills own the moves performed at each transition.

> **Evidence boundary**: this is an evidence-informed operating synthesis, not a scientifically proven
> universal algorithm. The primary-source ledger and its limitations are in `references/sources.md`.

**Atomic build.** Keep the contract, floor, focused regressions, trigger matrix, and forge ledger in one
change. Verify:

```bash
for f in SKILL.md references/creative-research-loop.md references/selecting.md \
  references/formulating.md references/not-fooling-yourself.md references/steering.md \
  references/research-process-postmortem.md references/reconciliation.md references/sources.md \
  assets/RUN-INTENT.md assets/RUN-RECEIPT.md assets/RETROSPECTIVE-JUDGMENT.md \
  scripts/research-check.ts scripts/research-run-check.ts scripts/research-run/primitives.ts \
  scripts/research-run/parse.ts scripts/research-run/model.ts scripts/research-run/joins.ts \
  scripts/research-run/packet-validation.ts tests/research-check.test.ts \
  tests/transfer-chain.test.ts tests/research-run-check.test.ts \
  tests/research-run-check-adversarial.test.ts tests/research-run-check-fixtures.ts \
  tests/family-routing.test.ts tests/triggers.md \
  tests/forge-verification-ledger.md; do
  test -f "$f" || echo "MISSING $f"
done
```

## THE LAW — research is a coupled search, not a creativity recipe

> Creative research does not proceed once through `problem -> idea -> evaluation`. It couples
> **exposed premises and problem frames** with **candidate theses and discriminating observations**.
> Excavate the dominant frame before treating it as the search space. Construct more than one frame.
> Generate a batch without scoring it mid-stream. Select on separate axes, then test one tree.
> Let controls, failures, and surprises update the thesis **and the problem frame**.
> A result that cannot change either is not research steering.

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
7. **Process is not outcome.** A favorable result cannot repair a process violation. A failed result
   does not prove the process failed. Retrospective verdicts remain evidence-linked and non-scalar.

## One-home ownership contract

Read this table before acting. A braided ask may use several skills **in this order**; that is a
transition, not joint ownership.

| Input state / decision | Sole owner | Required handoff artifact |
|---|---|---|
| The relevant literature or field position is unclear; or donor relations must be found without mapping them to a target | `systematizing-knowledge` | bounded evidence position + uncertainties, or target-agnostic `DONOR SET` |
| One present dataset, source, code path, benchmark, or anomaly is unclear | `raising-resolution` | cited observation / anomaly packet |
| One existing plan/frame has hidden premises, tacit constraints, or unasked decisions | `surfacing-blind-spots` | blind-spot packet; no invented human answer |
| The current lifecycle stage is unclear; problems must be constructed, selected, formulated, or compared; a program must be steered | **HERE** | stage card + RESEARCH JUDGMENT SPEC |
| A completed, failed, stopped, or aborted research episode needs semantic process review | **HERE** | RESEARCH PROCESS POSTMORTEM + updated RESEARCH JUDGMENT SPEC |
| A problem/frame is selected but no thesis candidates exist; or a frozen `DONOR SET` must be mapped to that frame | `forging-novel-theses` | frozen candidate-thesis packets, or frozen transfer bundle containing `CANDIDATE` / `MAPPING-BREAK` attempts |
| One selected tree contains an expensive, irreversible, load-bearing forward bet | `acting-on-hypotheses` | Map / Loop / Leap artifacts |
| One selected tree has a cheap, deterministic, reversible probe | domain/plain executor | observed result with locus; return it here for update |
| Evidence is finished and one manuscript claim must be argued | `arguing-research-papers` | CLAIM SPEC |
| Roles, delegation, visibility, veto timing, verification, or acceptance must be designed | `orchestrating-agents` | orchestration contract; domain artifacts stay with their owner |
| Research documents need portfolio-wide admission, authority, evidence lineage, review, retirement, or deletion | `governing-research-documentation` | governed document lifecycle artifact |
| Research task state must survive compact, session change, interruption, or handoff | `continuing-long-running-tasks` | canonical continuation-record locus; no duplicated research evidence |

**Cardinality + cost cut**: comparison, allocation, or reopening across **at least two independent
bets** is here. ONE tree goes to `acting-on-hypotheses` only when its hard gate fires for an expensive,
irreversible, load-bearing forward bet. Apply that gate before routing the tree. A plainly reversible
probe may be cheaper to run than to map. Use the domain/plain executor for that probe, then return its
observed result here. A single experiment's pass/fail threshold is never duplicated here.

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

## Research-process postmortem mode

Fire this named mode only for a completed, failed, stopped, or aborted research episode. It consumes
frozen `RUN INTENT` and immutable terminal `RUN RECEIPT` artifacts plus the current frame. It emits a
`RETROSPECTIVE JUDGMENT` and updates the existing `RESEARCH JUDGMENT SPEC`. It chooses `persist`,
`pause`, bounded `retire`, or the earliest honest stage to `reopen`.

Keep its two judgment axes distinct. `TRANSITION` selects the semantic research-state update.
`EPISODE_DISPOSITION` selects the programme action. Their pair requires an evidence-linked semantic
compatibility argument. The checker verifies only field presence and enum membership, not compatibility.
The exact meanings and adjudication rule live in `references/research-process-postmortem.md` §4.

Read `references/research-process-postmortem.md` before adjudicating. Use
`assets/RETROSPECTIVE-JUDGMENT.md`; do not restate its schema here. Historical gaps yield `PARTIAL` or
`UNAUDITABLE`. Never reconstruct prospective intent after outcome access. Never emit a scalar
creativity score. Exclude raw reasoning, transcripts, prompt/control text, secrets, and credentials.

## The creative-research loop

1. **GROUND** — obtain only the missing evidence state or present observation through the owning skill.
2. **EXPOSE OR BOOTSTRAP** — if a plan/frame exists, send that artifact to
   `surfacing-blind-spots`. If none exists, ground exactly one **PROVISIONAL-CONTROL** from step 1.
   It is for construction, not an alternative slate or a pretext to fire another skill. Expose it.
   Receive typed assumptions, a human-tacit probe record or `UNELICITED`, and a two-level depth trace.
   Also receive the open-set residual and strategic stop reason. Do not simulate the human's answer.
3. **CONSTRUCT** — attempt a grounded control and a frame that breaks a load-bearing premise.
   Also attempt an orthogonal frame that changes another assumption type. Route names do not make
   frames distinct. Their premise, decisive relation, or discriminator must differ. After one concrete
   attempt, a role may end as `COVERAGE GAP`. Name the attempted transformation, fixed constraint, and
   reason that fabricating the frame would be illegitimate. Admit structural transfer only as a program
   choice. Route donor discovery to `systematizing-knowledge`. Map the frozen `DONOR SET` in
   `forging-novel-theses`; never construct that map here.
4. **PROBE BEFORE NARROWING when needed** — use this when frame choice depends on its expressible theses.
   Select two or three frames for an equal bounded probe. Call `forging-novel-theses` once per frame,
   then compare only after every probe returns. Each call receives one selected-for-probe frame.
5. **FORMULATE** — state each surviving frame's decisive relation and cheap victory. Name a held-out
   witness and what the formalization discards.
6. **GENERATE** — hand one selected problem/frame to `forging-novel-theses`; receive candidate packets.
   For transfer, receive the frozen bundle by path and SHA-256. It must include every `CANDIDATE` and
   `MAPPING-BREAK` attempt. Do not ask that skill to test, fund, or kill them.
7. **FREEZE + DEDUP** — stop generation and preserve the denominator. Merge semantic duplicates before
   comparative scoring. Detect collapse on shared premise, target, discriminator, or the declared count
   floor. Send exactly one coverage-gap regeneration request to `forging-novel-theses`. With multiple
   agents, blind initial generation is an orchestration choice.
8. **SELECT** — judge consequence, discriminability, feasibility, novelty delta, and bounded loss
   separately. Record the loser reasons. For transfer, sign a `TRANSFER DISPOSITION` over every attempt.
   Assign each candidate `TEST`, `REOPEN`, `ADOPT`, or `RETIRE`. Preserve every `MAPPING-BREAK`.
   Source-side success cannot adopt or retire a target claim. If every attempt breaks, record `REOPEN`.
   Never manufacture a candidate to fill that state.
   Evaluator preference is evidence about the evaluator, not ground truth about idea quality.
9. **ACT ON ONE TREE** — apply the cost/reversibility hard gate. Send an expensive, irreversible,
   load-bearing thesis to `acting-on-hypotheses`. Its outcome table and threshold solely own per-test
   precommitment. Run an obvious cheap reversible probe through the domain/plain executor.
10. **UPDATE / REOPEN** — use the execution artifact, controls, and surprises to update the tree.
    Update the problem frame or portfolio when warranted. A controlled frame-breaking surprise returns
    to step 2. A frame-stable mechanism gap returns to step 6.
11. **RETROSPECT WHEN ASKED** — after an episode ends, the named postmortem mode may audit process
    separately from outcome. Ordinary result updates do not incur this ceremony.

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
| **D4 GOVERN** | protect integrity across runs and interpret a requested episode review | **Prediction-registry policy** + **Denominator policy** + **Independent-audit requirement**; optional **RESEARCH PROCESS POSTMORTEM**; actor assignment stays with `orchestrating-agents` |
| **D5 STEER** | allocate/reopen at program altitude | **Portfolio update** + **Reopen rule** |

`scripts/research-check.ts` is only a structural floor. It cannot decide whether a frame is important,
a witness is uncontaminated, or an auditor is truly independent.

`scripts/research-run-check.ts` checks run-record shape, hashes, enums, joins, terminal coverage, and
known privacy patterns. It cannot judge creativity or causal validity. It also cannot judge surprise
importance, true independence, or completeness outside declared coverage.

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
match the declaration. Recheck its frozen bundle binding, candidate ID, target observation, and
prewritten numeric threshold. Also recheck its exact target-only locus, threshold result, mapping
assessment request, and break-preserving handoff. Reject donor IDs or donor/source success as target
evidence. Reject source-identity reuse at another anchor and contradictory numeric verdicts.
`ADOPT` also requires `PASS` and `Mapping assessment request: NONE`. An unresolved correspondence
request returns to `forging-novel-theses` before adoption. Resolve each declared path and CLI argument
to the same frozen artifact. SHA-256 supplies an independent freeze check. For example:

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
  analogy is not a quality signal. A transfer candidate needs a target-side prediction. It also needs
  an alternative discriminator. Donor success is not target-side support.
- **No premise monoculture**: a control and a premise-breaking frame must coexist long enough to compare.
  A list of different route names that shares one ontology, causal direction, proxy, and regime is one
  frame family.
- **No pretend elicitation**: use the answer from `surfacing-blind-spots` when tacit context is
  load-bearing. Otherwise record `UNELICITED`. An agent-authored “expert intuition” is counterfeit.
- **No feasibility monoculture**: feasibility-heavy selection can discard original candidates. Preserve
  the separate-axis record and compare proposal-stage judgment with execution-stage evidence.
- **No all-in inference**: occasional high upside does not justify putting all resources into risky work.
  State the safe core, bounded probe, and loss cap.
- **Direction-level kill**: retire only the tested family's supported closure. Flat learning caused by
  an access or measurement block is not evidence that the scientific space is empty.
- **No outcome laundering**: judge process and outcome independently. A positive result does not clear
  a violated process lens; a negative result does not establish one.

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
| “Why was agent dispatch slow, and why did critique see the candidates early?” | `orchestrating-agents`; dispatch/pacing/delegation postmortem |
| “Which research documents should exist, be authoritative, be reviewed, or be retired?” | `governing-research-documentation` |
| “Keep this task resumable across compact or executor handoff.” | `continuing-long-running-tasks`; transport loci only |
| “Postmortem this generic software outage.” | incident/domain owner; not a research-process postmortem |
| “Give me daily habits for feeling imaginative, unrelated to a research decision.” | outside this family; answer directly or use an appropriate human-practice source |

**Broad asks fire HERE**. Examples include “どうすれば創造的な研究ができる?” and “help me plan and
run this research programme.” Braided asks may span problem finding, ideation, experiments, and
steering. Diagnose first. `orchestrating-agents` adds its overlay only after the domain map is signed.

## Orchestration seam

Research content and agent control are orthogonal:

- **HERE / siblings** decide problem frames, candidate schema, admission criteria, and test meaning.
  They also decide the research verdict.
- `orchestrating-agents` decides visibility, critique timing, parallelism, veto, and acceptance records.
- A semantic research-process postmortem stays HERE. Dispatch, pacing, delegation, visibility, and
  acceptance postmortems stay with `orchestrating-agents`.
- `governing-research-documentation` governs durable files. `continuing-long-running-tasks` transports
  loci across sessions. Neither changes or duplicates the semantic research verdict.

For a multi-agent run, freeze the domain sequence first:

```text
directing-research
  -> surfacing-blind-spots -> directing-research
  -> [systematizing-knowledge -> forging-novel-theses | forging-novel-theses]
  -> directing-research -> [acting-on-hypotheses | domain/plain executor]
  -> directing-research
```

Then let `orchestrating-agents` assign roles. More agents do not prove more ideas or better research.

## Reference index

| File | Load when |
|---|---|
| `references/creative-research-loop.md` | running or explaining the full creative-research lifecycle |
| `references/selecting.md` | constructing, comparing, and selecting problem frames |
| `references/formulating.md` | closing cheap victories and separating optimized metric from trusted witness |
| `references/not-fooling-yourself.md` | defining the standing registry, denominator, and independent-audit policy |
| `references/research-process-postmortem.md` | judging a completed, failed, stopped, or aborted research episode separately from its outcome |
| `references/steering.md` | updating a portfolio across at least two independent directions |
| `references/reconciliation.md` | resolving scoped tensions without universal slogans |
| `references/sources.md` | checking provenance, limitations, rejected universal claims, or research gaps |
| `scripts/research-check.ts` | validating a RESEARCH JUDGMENT SPEC and its active frozen transfer chain |
| `scripts/research-run-check.ts` | checking RUN INTENT / RUN RECEIPT / RETROSPECTIVE JUDGMENT structure and joins |
| `tests/research-check.test.ts` | changing validator behavior or its fail-closed transfer gates |
| `tests/transfer-chain.test.ts` | validating the DONOR SET → FNT bundle → director disposition integration |
| `tests/triggers.md` | changing any description or sibling boundary |
| `tests/forge-verification-ledger.md` | auditing this reforge and its unresolved evidence limits |
