# Creative-research loop — transition contract

This file owns the **transitions** in creative research. It does not absorb the craft owned by sibling
skills. Use it when a broad request spans problem finding, thesis generation, experiments, and program
updates.

## 1. Why the loop is non-linear

The defensible synthesis is:

```text
evidence / observation
        ↓
surface hidden premises + tacit constraints
        ↓
construct several problem frames
        ↓
generate a frozen thesis batch
        ↓
select on separate axes
        ↓
test one hypothesis tree
        ↓
execution result + controls
        └────────→ update thesis, problem frame, or portfolio
```

This is an **editorial synthesis**, not an algorithm directly validated end-to-end. Its components have
different evidence scopes:

- problem construction predicts performance in bounded creative-problem tasks;
- scientific reasoning can alternate between hypothesis-space and experiment-space search;
- real-lab observations show problem representations and hypotheses changing around surprising results;
- design studies directly observe problem-solution co-evolution, but transfer to science is analogical;
- proposal novelty can fall after execution, so proposal-stage evaluation is not enough.

See `sources.md` for source grades, sample sizes, and limitations.

## 2. Transition artifacts

### T0 — unknown state to a stage card

Emit:

```markdown
- Stage: [...]
- Evidence: [...]
- Earliest missing dependency: [...]
- Next owner: [...]
- Return condition: [...]
```

Do not fire every research skill at once. Route to the earliest missing dependency and name what artifact
returns control here.

### T1 — received or provisional control to blind-spot packet

If a plan/frame exists, send it one at a time to `surfacing-blind-spots`. If no frame exists, first use
grounded evidence from T0 to state exactly one `PROVISIONAL-CONTROL` frame. It exists to make a broad
topic inspectable; it is not an alternative slate and must not be fabricated merely to make
`surfacing-blind-spots` fire. Then send that artifact:

```markdown
- Object under review:
- Frame provenance: [RECEIVED / PROVISIONAL-CONTROL + evidence locus]
- Decision at stake:
- Evidence already grounded:
- Human owner available: [YES/NO]
- Search budget:
```

Receive the assumption ledger, open-set residual, tacit-knowledge probe record, depth trace, discoveries,
handoff, and stop reason. `UNELICITED` is a valid and honest human-probe result. An agent-generated answer
on behalf of the researcher is not.

`surfacing-blind-spots` owns excavation. This skill decides what the returned packet means for the
research program.

### T2 — blind-spot packet to problem frames

Attempt three role slots with different **functional relations to the packet**:

1. **grounded control** — preserves the dominant premise so novelty is compared against a visible base;
2. **premise break** — negates or replaces one load-bearing assumption;
3. **orthogonal frame** — changes another primary assumption type or investigates the open-set residual.

If one role is impossible after one concrete attempt, record `COVERAGE GAP` in that role with the
attempted transformation, the fixed fact/constraint, and why inventing a candidate would be
illegitimate. The gap is an honest output, not permission to stop at “could not think of one.”

| Route | Question | Provenance requirement |
|---|---|---|
| anomaly | What controlled observation violates the current account? | observation + control/artifact alternatives |
| competing explanations | Which two accounts predict different outcomes? | both accounts and the discriminator |
| consequence | What uncertainty blocks an important downstream decision? | affected decision / stakeholder |
| constraint inversion | Which claimed constraint is physical, informational, institutional, or merely inherited? | source for the constraint |
| missing comparison | What baseline, population, regime, or counterfactual is absent? | existing comparison set |
| structural transfer | Is a source relation worth a bounded transfer route for this program? | frozen, target-agnostic `DONOR SET`; `forging-novel-theses` owns any target map |

Routes are recipes, not a partition. Frames are not distinct merely because their route labels differ.
A candidate frame is distinct only if its held/broken premise, decisive relation, discriminator, or
consequence differs.

#### Structural-transfer route — admit, map, then dispose

This skill may decide that a structural-transfer route is worth bounded program attention. It does not
search for the donor relation or construct the source-to-target correspondence.

1. If source relations are not bounded, route to `systematizing-knowledge` for a target-agnostic
   `DONOR SET`: distinct donor evidence, source relation/locator, scope, preconditions, observable
   consequence, and boundary. A single donor remains a hypothesis seed, not a general schema.
2. Hand the selected target frame and frozen `DONOR SET` to `forging-novel-theses`. It owns comparison,
   correspondence, non-correspondence, transfer boundary, and precision loss, and returns a frozen
   transfer bundle containing either `CANDIDATE` or `MAPPING-BREAK` for every attempted map.
3. Receive that bundle by path and SHA-256. This skill owns only the subsequent program decision; it
   must account for every attempt and preserve every break. It never repairs a map to make admission
   easier.

The route is an editorial contract, not an external finding that a particular donor distance, broker,
or documentation form causes discovery. The empirical sources support limited claims about relational
comparison, transfer, and translation across boundaries; see `sources.md` C21–C27.

#### Optional cross-frame micro-probe

If selecting a frame depends on what claims it makes expressible, nominate two or three frames for an
equal, declared micro-budget. Call `forging-novel-theses` separately for each nominated frame; do not
expose one frame's candidates to the other calls. Compare only after every call returns. This is
problem-thesis co-evolution, not joint ownership: one call still receives one selected-for-probe frame,
and this skill owns the cross-frame decision.

### T3 — selected frame to thesis generation

Hand `forging-novel-theses` an input brief:

```markdown
- Selected problem/frame:
- Observations it must explain:
- Excluded cheap victories:
- Known prior position:
- What is allowed to change:
- Requested candidate count:
```

Receive candidate packets. Do not ask that skill for kill thresholds, funding logic, or portfolio
allocation.

### T4 — generated batch to admission

Before ranking:

1. freeze the batch and record its total size;
2. remove exact duplicates;
3. cluster semantic duplicates without deleting their provenance;
4. inspect the survivors' `premise × target × operation × discriminator` coordinates;
5. if all survivors share a premise, target, or discriminator—or unique survivors fall below
   `min(3, requested)`—send exactly one **coverage-gap packet** to `forging-novel-theses`;
6. evaluate only after that bounded recovery returns or reports `COVERAGE GAP`;
7. preserve every rejection and failed-transformation reason.

Coverage-gap packet:

```markdown
- Original requested count:
- Pre-dedup denominator:
- Surviving candidate IDs + coordinates:
- Collapsed dimension: [premise / target / discriminator / count]
- Occupied cells:
- Requested unoccupied legitimate cell:
- Regeneration budget: ONE pass
```

`directing-research` detects collapse because it owns freeze/dedup/admission.
`forging-novel-theses` owns the one targeted regeneration because it owns genesis.

#### Transfer disposition within admission

For a frozen transfer bundle, add `TRANSFER DISPOSITION` to the RESEARCH JUDGMENT SPEC. Name the bundle
path and SHA-256; pass that same resolved path through `--transfer-bundle`; use its complete attempt ID
set as the denominator; give every candidate one of
`TEST`, `REOPEN`, `ADOPT`, or `RETIRE`; and preserve every `MAPPING-BREAK` ID.

- `TEST` requires the candidate's target-side prediction and discriminator plus an `UNTESTED` prediction
  registry and target-side handoff.
- `ADOPT` requires a frozen `TARGET RESULT` path/SHA passed through `--target-result`. The result must
  bind the same frozen transfer bundle and candidate, retain a non-vacuous numeric threshold fixed
  before target observation, use a target-only locus whose source identity is not a donor source,
  agree arithmetically with `PASS`, and carry `Mapping assessment request: NONE`. A donor ID/result or
  unresolved request to reassess the correspondence blocks adoption.
- `RETIRE` requires the same frozen result and names the tested mapping family or transfer boundary;
  retirement remains a program decision and does not rewrite the recorded `PASS` or `FAIL`.
- If every attempt is a `MAPPING-BREAK`, use no candidate disposition and write `REOPEN`; retain the
  breaks as evidence about the failed correspondence rather than inventing a replacement candidate.

This is a director's disposition, not a validation of the mapping itself. The exact fields, digest, and
target-evidence gate are house controls; they are not claimed as causal effects of the cited studies.

Use separate axes:

| Axis | Question | Not a substitute for |
|---|---|---|
| consequence | What becomes possible or falsified? | feasibility |
| discriminability | Can available evidence distinguish it from alternatives? | rhetorical clarity |
| feasibility | Is a meaningful test reachable with current access? | value |
| novelty delta | What changes relative to the nearest prior? | truth |
| bounded loss | What is the maximum cost of learning? | expected upside |

Do not multiply or sum these into a universal score. A threshold or partial order can be local to the
program, but it must preserve the axis record.

### T5 — admitted thesis to gated one-tree action

First apply the one-tree hard gate:

- expensive, irreversible, load-bearing forward bet → `acting-on-hypotheses`;
- deterministic, obvious, cheaper-to-run, reversible probe → domain/plain executor.

For the first branch, hand exactly one selected thesis to `acting-on-hypotheses`:

```markdown
- Selected thesis packet:
- Load-bearing uncertainty:
- Alternatives that must remain live:
- OPEN-SET RESIDUAL (PASS-THROUGH): [residue] — provenance=[locus]; reopen-when=[observable trigger]
- Available signals / access:
- Maximum survivable loss:
```

That skill owns the hypothesis map, per-test pass/fail threshold, outcome-to-action table, and
commit/kill decision. The OPEN residual is a monitored handoff field, not an in-tree fact. For the
cheap branch, record the result with a locus and return directly to T6.

### T6 — execution result to research update

Return here with:

```markdown
- Prediction registered before the run:
- Observed result:
- Controls and artifact checks:
- Which alternatives gained/lost support:
- New observation or missing node:
- Scope actually tested:
```

Choose one update:

- **tree update** — remain in `acting-on-hypotheses`;
- **thesis regeneration** — return to `forging-novel-theses`;
- **problem reconstruction** — return to T1, then T2;
- **portfolio update** — compare/reallocate at least two independent directions here;
- **finished claim** — hand to `arguing-research-papers`.

A null or failed test retires only the tested claim family. A surprising result earns a frame change
only after controls and artifact alternatives make the surprise interpretable. If the new node cannot
be placed inside the selected frame without changing its `OBJECT`, `RELATION`, `OBSERVATION`, `REGIME`,
`VALUE`, or `ACTION`—or if it activates the external `OPEN` residual—`acting-on-hypotheses` returns
`FRAME-BREAK` here instead of silently expanding its Map.

## 3. Generation and evaluation discipline

### Generate without live scoring

During a bounded generation window:

- vary `premise × target × operation × discriminator`, not just the recipe name or wording;
- preserve a transformation trace;
- do not show one generator another generator's candidates unless the orchestration contract explicitly
  chooses convergence;
- do not ask the generator to score its own candidate batch;
- stop at the declared batch size.

The purpose is not “more ideas”. It is to make the search denominator and occupied search cells visible,
prevent the first plausible candidate from silently becoming the frame, and detect when nominal variety
collapses to one premise family.

### Evaluate without pretending the evaluator is ground truth

Evaluator judgments can over-weight feasibility, penalize unfamiliar novelty, or disagree with
execution outcomes. Therefore:

- state the domain **Independent-audit requirement**: required separation, frozen evidence surface,
  hostile lens, and acceptance condition;
- preserve axis-level reasons;
- distinguish “reviewer disliked it” from “evidence contradicts it”;
- reassess after an execution artifact exists.

`orchestrating-agents` instantiates the requirement as actors, blindness, role visibility, veto timing,
authority, and acceptance records. This file never names the actors; it owns only the domain invariant
and what the research stages mean.

## 4. Human incubation: a conditional side branch

Incubation is permitted only after:

1. the person has prepared the problem;
2. a concrete impasse is named;
3. the break is bounded;
4. the returned idea re-enters the same provenance, admission, and test gates.

It is optional. Evidence is heterogeneous across tasks and interventions. It has no validated agent
analogue; an agent should diversify explicit routes instead of role-playing mind wandering.

## 5. Claims this loop forbids

Do not turn any of these into LAW:

- “problem setting is 80% of creative research”;
- “creation is hard but criticism is easy”;
- “distant analogy is the main cause of discovery”;
- “a donor-domain success validates the target claim”;
- “a wiki, shared vocabulary, or co-location by itself resolves a knowledge boundary”;
- “an anomaly contains its discovery automatically”;
- “incubation or the default-mode network reliably produces insight”;
- “novelty equals value”;
- “feasibility identifies the best idea”;
- “more candidates or more agents monotonically increase diversity or quality”;
- “creative research is a fixed linear pipeline”;
- “one scalar such as impact × solvability × originality ranks all problems”;
- “AI research ideas are more creative than human ideas in general”;
- “high-risk research should receive all resources”.

These propositions are broader than the cited evidence or are contradicted by scoped counterevidence.

## 6. Distillation of the supplied Gemini conversation

The conversation is an input proposal and failure trace. It is not a source of empirical authority.

| Proposal in the conversation | Disposition | Operational home |
|---|---|---|
| problem/issue observation matters | **retain, de-quantify** — problem construction is consequential, but no “80%” claim | `directing-research` problem frames |
| analogy and recombination | **retain with a gate** — map relations and derive a new prediction; distance is not quality | `forging-novel-theses` |
| incubation / DMN | **narrow sharply** — optional human branch after preparation/impasse; heterogeneous evidence; no agent analogue | this transition contract |
| small, fast hypothesis tests | **retain as cheapest discriminating action**, not a universal `<=100 lines` toy-model rule | domain/plain executor unless expensive/irreversible downstream exposure makes the AOH hard gate fire |
| axiom decomposition / MECE issue tree | **retain as one generation/structuring route**, not an exhaustive theory of creativity | `directing-research` / `forging-novel-theses` |
| `impact × solvability × originality` | **reject as a universal scalar**; preserve separate axes and rejection reasons | `directing-research` admission |
| “criticism is easy; creation is hard” | **reject** — idea selection and evaluation have their own documented failure modes | generation/evaluation cut |
| “golden issue” | **retire the label** — the conversation itself admits it was coined there; no stable owner or validated construct | use explicit frame/selection artifacts |
| unresolved-reason matrices | **retain only as an alternative-account artifact** when cells carry evidence and discriminators | problem construction |
| the four “essential difficulties” | **treat as candidate failure modes**, not an exhaustive partition | tests and source ledger |

The result is therefore not the conversation's four-step recipe. It is the owner-routed feedback loop in
this file.
