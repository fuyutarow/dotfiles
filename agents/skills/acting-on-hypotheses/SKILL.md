---
name: acting-on-hypotheses
description: >-
  Acts on ONE SELECTED hypothesis tree for costly/hard-to-reverse work; maps; runs cheapest
  discriminating test against prewritten threshold/outcome table; then Commit/Pivot/Kill. Use: 仮説検証,
  仮説行動, Map-Loop-Leap, de-risk, should-we-commit. Owns tree, table, Commit/Pivot/Kill. Target evidence
  only; never emits/reclassifies MAPPING-BREAK. Raw executor result/provenance, TARGET RESULT,
  FRAME-BREAK, triggered OPEN→directing-research-sections under current
  SECTION_MANDATE/SECTION_CHARTER. Programme landscape/formulation, OPEN_ISSUE portfolio, multiple bets,
  global ADOPT/RETIRE/REOPEN→supervising-research-programmes. Candidate genesis/mapping→forging-novel-theses;
  tacit premises→surfacing-blind-spots; present fact→raising-resolution; corpus→systematizing-knowledge;
  finished claim→arguing-research-papers. Cheap deterministic reversible no-exposure probe→domain/plain
  executor. Post-selection experiment integrity only→practicing-tiger-style. English; respond in user
  language.
---

# 仮説行動 — Map · Loop · Leap (act under irreducible uncertainty)

> **Scope**: A domain-neutral decision discipline.
> It covers refactor, research direction, architecture choice, and product bets; it is not startups only.
> Distilled from 馬田隆明『仮説行動』; the book is *lineage*, not *content to recite*.
> This file holds the precedence-setting CORE inline.
> Phase technique and inter-skill routing live in `references/` and load on demand.

**Build order (atomic).** Ship this SKILL.md with its five reference targets, `tests/triggers.md`,
and `tests/forge-verification-ledger.md`. Verify:

```bash
for f in map loop leap boundaries anti-patterns; do
  test -f "references/$f.md" || echo "MISSING references/$f.md"
done
for t in triggers forge-verification-ledger; do
  test -f "tests/$t.md" || echo "MISSING tests/$t.md"
done
```

## Language

This skill is **English**. The deliverable defaults to the user's language, normally Japanese.
Keep these stable tokens unchanged, including inside Japanese prose:

- 仮説行動, マップ・ループ・リープ, 確信度×影響度, and 学びの最大化

- Map / Loop / Leap, the load-bearing node, and win/kill/loss

- **TARGET RESULT** and **MAPPING-BREAK**

## Tiger experiment-integrity seam

When a selected tree drives expensive or hard-to-reverse experiment work, keep the tree,
prewritten threshold, outcome table, and Commit/Pivot/Kill HERE first. Then
`practicing-tiger-style` may add experiment-integrity bounds and negative cases; it does not
choose, revise, or accept the hypothesis outcome.

## CORE — read every time (precedence-setting)

The model is a **GATE + 3 PHASES + a recurring stagnation check** — *not* "Map/Loop/Leap alone are
exhaustive". The GATE (STEP 0) decides whether this fires at all and whether the gap is
present-understanding or future-bet. The three phases are partitioned by **verb**, not by artifact.
The stagnation check recurs whenever Loop is running. THE LAW below overrides default behaviors and is
stated as law **only here**.

### THE LAW

> On open-ended, uncertain, or ambitious tasks, do **NOT** freeze, over-ask, or collect more until "certain".
> Do **NOT** build a big-bang on unvalidated assumptions.
> You **MUST** Map → Loop → Leap.
> Reach Leap only after Loop retires the **fatal risks on the load-bearing node**.

Its authority is carried by three checkable sub-rules.
**Each MUST emit a grep-able artifact**, mirroring `systematizing-knowledge`'s ledger-token discipline.
No artifact means the rule is not satisfied.

| # | Rule | What it inverts | ARTIFACT (must exist) |
|---|---|---|---|
| **R1** | **Anti-freeze.** Uncertainty is **not** a reason to ask the user or research more — it is a coordinate on the map telling you what to **TEST**. Convert every "I'm not sure" into a NAMED hypothesis node + the single cheapest discriminating action. | the model's default to ask / hedge | a named node with a **確信度×影響度** tag — *never* a clarifying question you could instead cheaply test |
| **R2** | **Anti-big-bang.** No code / design / decision that depends on an **untested load-bearing node** may be built at full scale before that node's cheapest test runs. Felt confidence ≠ earned confidence. | assuming confidence per-node | a **written pass/fail threshold** for the load-bearing node, set BEFORE acting |
| **R3** | **Falsify, don't flatter.** Before running ANY Loop test, write the two outcomes and the **different next-action** each implies. If pass and fail lead to the **SAME** next move, it is a **vanity test — FORBIDDEN, do not run it.** Aim the test at the belief most likely to be WRONG and most DECISIVE; treat disconfirming evidence as the win. | confirmation-shaped checking | a **two-row outcome→next-action table** per Loop iteration |

### STEP 0 — THE GATE (hard over-firing guard; this is the precedence top gate)

**Over-firing is the primary liability**: three-phase ceremony becomes "be-bold theater".
Fire this skill only when both conditions hold:

1. a load-bearing belief is untested;

2. its dependent work is expensive, meaning more than about one reversible session, or hard to reverse.

Then run the cut and the cheapness rule:

- **The cut (vs raising-resolution).** Ask:
  *"Could a smart person, given enough primary information about what ALREADY EXISTS, know the answer?"*

  - **YES** → present-understanding gap → **raising-resolution**.
    If it is unavailable, use the bounded inline fallback in `references/boundaries.md`.
    Do **not** relabel that resolution pass as a Loop.

  - **NO** → future-bet gap → continue.

  - Deterministic / known-method task → **just do it** without ceremony.

- **The exposure cut.** Apply it even after a tree has been selected.
  Route to **surfacing-blind-spots** when the requested verb is to expose any of these:

  - hidden premises;

  - ignored anomalies;

  - unpublished failures;

  - workarounds;

  - human tacit constraints.

  Return here only after those premises are explicit and the next verb is STRUCTURE / TEST / COMMIT.
  Do not call premise excavation a Map.

- **Cheap executor cut.** This skill does **not** fire when both conditions hold.
  No expensive-or-hard-to-reverse work rides on the result.
  The obvious probe also fits all four properties below:

  - deterministic;

  - known-method;

  - bounded;

  - reversible inside one ordinary session.

  Send that probe to the domain owner or plain executor.
  It returns the raw result and provenance to `directing-research-sections`.
  The return stays under the current `SECTION_MANDATE` and `SECTION_CHARTER`.
  Do not manufacture a Map, threshold, or Leap.
  A cheap discard-intent test may still protect a later expensive or irreversible decision.
  That is a genuine Loop here: downstream exposure, not test price, is the tie-break.

- **Under-firing guard (subordinate to the gate).** Fire when both gate conditions hold,
  **even if you feel confident**. Felt confidence is not earned confidence under R2.
  It cannot justify ceremony on routine work; the gate wins.

### The three phases — verb-based seams (closes the Map/Loop overlap)

| Phase | VERB | Owns | Never does |
|---|---|---|---|
| **MAP** | **STRUCTURE & POSITION** | adds/removes/repositions nodes that still fit the selected tree, tags each 確信度×影響度, names the load-bearing node; **performs** integration/統合 (merging sub-maps) | produces no evidence; writes no test-derived confidence; does not excavate unknown premises or absorb a frame-breaking node |
| **LOOP** | **TEST & WRITE-VALUES** | the **only** phase that runs a test and **writes a confidence value** onto an EXISTING node; owns 学びの最大化 | never adds/removes nodes — if a test reveals a missing node, **FLAG** it and hand a cheap in-place Map pass the restructure |
| **LEAP** | **COMMIT & REALIZE** | the **only** phase that stakes a kept output and produces the outcome itself (仮説を正解にする); owns reversibility sizing (one-way vs two-way door); changes confidence only as a POST-COMMIT byproduct of reality | never runs a discard-intent probe (that is Loop's verb); never launders a cheap executor probe into a ceremonial commitment |

**Disambiguation — "hypothesis" has EXACTLY ONE role per phase.** These roles exhaust the three phases:

- **POSITIONED** — Map places and tags a node in the tree.

- **FALSIFIED** — Loop targets a node with a test that tries to kill it.

- **COMMITTED-AND-REALIZED** — Leap makes the chosen bet true.

Use the verb as the tell:

- placing or structuring it → **Map**;

- trying to kill it with a test → **Loop**;

- staking on it to make it real → **Leap**.

**Disambiguation — cut "action" CATEGORICALLY by INTENT-AT-DESIGN, not by reversibility.**

- A **LOOP action** is pre-committed to **THROW AWAY** and not depend on.
  Size it to the **signal**: a spike, throwaway MVP, concierge probe, or one real run/user.

- A **LEAP action** is pre-committed to **KEEP and BUILD ON**.
  Size it to the outcome.

A staged or reversible Leap is **STILL Leap**, because you keep and depend on stage 1.
Use this tie-break: "Did I pre-commit to discard this, or to keep and depend on it?"
There is no keep-possible exception.
A trial without expensive or irreversible downstream exposure was already routed out by STEP 0.
It does not become a Leap merely to preserve the phase taxonomy.

**Ordering is a dependency, not a waterfall.** Use Map → Loop → Leap.
Loop feeds back into Map when a surprising result requires restructuring or demotes a planned Leap.
A single iteration may legitimately run **Loop (test) → Map (node-add)**.
The verbs can co-occur in one cycle, but their **ARTIFACTS** stay separate.
Loop emits `NEW NODE flagged by Loop iteration N`; Map places it under `references/map.md` §6.
The stagnation check recurs whenever Loop runs.
Never skip Map → Leap before Loop retires the fatal risks on the load-bearing node.

## Procedure (STEP 0–4 + recurring check)

> Structure = GATE + 3 verb-phases + recurring stagnation check.
> Only the three phases are MECE by verb; the whole structure is not exhaustive.
> Reversibility sizing belongs inside LEAP's COMMIT verb, not in a separate step.

- **STEP 0 — GATE** *(owned here, above).* Apply the firing threshold, the cut, the cheapness rule.
  Route to raising-resolution / just-do-it / continue.

- **STEP 1 — MAP** *(draw, don't perfect — TIME-BOX is a first-class rule).* Write the overarching
  hypothesis as one falsifiable **言い切り**. Decompose it into sub-hypotheses:

  - build: value / feasibility / approach / integration / cost;

  - research: claim / method / data / baseline.

  Tag each node **確信度(0–100%)×影響度**.
  Work **ざっくり, then STOP**: set an explicit time-box and move.
  Endless Mapping is a banned failure mode.
  Run two scans: low-確信度 nodes show what to test; win/lose nodes show what is decisive.
  **Load-bearing node = max(uncertain × decisive).**
  If the present is too blurry to NAME the nodes, treat it as a resolution gap and route per STEP 0.
  Output the map and the single named node that Loop attacks.
  Copy any incoming `OPEN-SET RESIDUAL` unchanged with its provenance and observable reopen trigger.
  OPEN is never a node or a fact. Technique lives in `references/map.md`.

- **STEP 2 — LOOP** *(cheapest FALSIFYING test).* Plan in reverse **L→M→B**, execute **B→M→L**. Apply
  R3's outcome→next-action table FIRST to kill vanity tests.
  Pre-commit the pass/fail threshold.
  Prefer an objective behavioral signal over self-reported enthusiasm.
  Valid examples include a passing test, real attention/payment/time, or a reproduced number.
  Build the minimum that yields the signal: sell-before-build, concierge, or a single spike.
  WRITE the confidence value onto the node.
  If a missing node surfaced, FLAG it.
  Run a cheap in-place Map pass only when that node still fits the selected tree.
  A frame-breaking discovery emits `FRAME-BREAK`.
  Return it to `directing-research-sections` under the current mandate and charter.
  Give it exactly one primary slot:

  ```text
  OBJECT / RELATION / OBSERVATION / REGIME / VALUE / ACTION / OPEN
  ```

  `VALUE` and `ACTION` are frame breaks.
  `OPEN` remains an external residual for the current section.
  It is never absorbed into this tree.
  Loop never edits structure.
  **STOP when fatal risks on the load-bearing node are retired, NOT at 100% confidence.**
  Complete confidence never comes.
  On a multi-agent harness, only the probe's **Build→Measure** may run as a subagent.
  It must use the probe contract in `references/loop.md` §8.
  Keep the discrimination table, pass/fail adjudication, confidence write, and Leap in your context.
  An agent's opinion is never a signal. Technique and 学びの最大化 live in `references/loop.md`.

  **Transfer guard.** Copy the candidate ID and frozen transfer-bundle path/digest.
  Also copy the donor-set locus and correspondence locators from the selected transfer candidate.
  Begin with `target-side evidence: UNTESTED`.
  Test a target-side observable consequence of the preserved relation.
  Donor success, fluent analogy, and agent endorsement may motivate a test.
  They cannot move target confidence or satisfy its threshold.
  Return the outcome as a `TARGET RESULT` to `directing-research-sections`.
  The return stays under the current `SECTION_MANDATE` and `SECTION_CHARTER`.
  Loop never emits or reclassifies `MAPPING-BREAK`.
  If the observation questions the correspondence, request a new assessment from `forging-novel-theses`.
  Only that skill may emit a `MAPPING-BREAK`.
  `directing-research-sections` records the local `MAPPING_TRANSFER_DISPOSITION` under the current
  mandate and charter.
  The exact result contract is in `references/loop.md` §3.
  If the result becomes a durable reviewed repository artifact, govern it with
  `governing-research-documentation`. That skill owns only its locus, lineage, review, and retirement.
  It never changes the threshold or mapping meaning.

- **RECURRING — STAGNATION CHECK** *(runs whenever Loop is active; it has a home, not orphaned).*
  Ask three questions:

  - Is the hypothesis written and shared?

  - Is the node-under-test named?

  - Are you tuning on results, or perfectionism-stalling?

  Use two first-class exits:

  1. The load-bearing node is **not falsifiable by any test you can actually run here**.
     This includes lacking access to the real signal or facing a co-creation question.
     Switch the node from FALSIFY-mode to **DIALOGUE/CO-CREATION-mode**.
     Otherwise, escalate that access is the blocker.
     Do not felt-Loop an unrunnable node.

  2. **「回らないなら、いる場所が悪いのかも」**.
     If the loop structurally cannot turn, escalate the environment; do not churn.

- **STEP 3 — LEAP** *(evaluate → decide → realize → size reversibility — all ONE verb: COMMIT & REALIZE).*
  EVALUATE on **確信度(now earned)×影響度**.
  Do not default to the safe small bet: **君の仮説は小さくまとまっている** is small-bet disease.
  Before committing, WRITE the load-bearing triple:

  - win condition;

  - kill/withdrawal condition;

  - survivable loss cap.

  Set all three BEFORE acting so sunk cost cannot rewrite them.
  DECIDE by stating the chosen approach and why; then commit.
  **SIZE REVERSIBILITY** inside the COMMIT verb, not as a separate step:

  - **two-way door** — reversible or bounded loss.
    Leap boldly even at mid confidence when upside is asymmetric.

  - **one-way door** — irreversible or unbounded.
    Demand more Loop or restructure into staged/reversible commits.

  **大きく考え、小さく踏み出せ.**
  REALIZE by honoring the kill condition over sunk cost.
  When reality diverges, adjust execution or pivot toward the goal before declaring the hypothesis dead.
  Execution can make a hypothesis true.
  Technique, the WIN/KILL/LOSS template, and the door-type checklist live in `references/leap.md`.

- **STEP 4 — OUTPUT in the USER'S LANGUAGE (Japanese).** Include:

  - the hypothesis map with nodes and 確信度×影響度;

  - each Loop's outcome→next-action and what moved;

  - the Leap decision with win/kill/loss conditions;

  - the current load-bearing open node.

  Carry the incoming `OPEN-SET RESIDUAL` unchanged, including provenance and reopen trigger.
  If it fires, output the raw signal and `FRAME-BREAK` handoff to `directing-research-sections`.
  Do not absorb it into the tree. When the local frame break exceeds the mandate, that Director may
  declassify a typed `SECTION_REOPEN_REQUEST`. Only `supervising-research-programmes` may enact
  programme reopening.

## Reference index — load the file you need

| File | Covers | Read when |
|---|---|---|
| `references/map.md` | overarching 言い切り; sub-hypothesis node sets; 確信度×影響度 tagging; rough-first + TIME-BOX; the two prioritization scans; integration/統合; FRAME-BREAK typing; OPEN pass-through; "can't name nodes → resolution gap"; hand-off to Loop | drawing/auditing the hypothesis map |
| `references/loop.md` | B-M-L planned in reverse; the R3 discrimination table; metric pre-commitment + vanity avoidance; minimum-scope discard-intent probes; OPEN-trigger check; "Loop never edits structure"; the STOP condition; 学びの最大化; the 反証=disconfirming-signal honest limit; the §8 probe-delegation contract (multi-agent harness) | designing/running a test |
| `references/leap.md` | evaluate→decide→realize; the written WIN/KILL/LOSS triple; door-type (one-way vs two-way) + keep-vs-discard intent; reversibility sizing; 大きく考え小さく踏み出せ; provenance bridge-tags | committing a bet |
| `references/boundaries.md` | the inter-skill cut as a PURPOSE test; co-fire arbitration + ordering for braided tasks (worked example); cheap-executor return; self-contained inline-resolution fallback; repo-neighbor differentiation; lineage vs 仮説思考 / lean+OODA / effectuation / SoK | routing away / placing this skill |
| `references/anti-patterns.md` | in-skill misuse diagnostics with observable TELL + recovery: freeze, big-bang, endless-Loop, endless-Map, vanity test, reckless irreversible Leap, small-bet disease, felt-Loop on an unrunnable node | auditing your own output |
| `tests/triggers.md` | fire / no-fire / ordered co-fire desk-check, including the target-side transfer guard | after any description or boundary edit |
| `tests/forge-verification-ledger.md` | reforge evidence, warning counts, and debt queue | auditing this skill itself |

## See also

**raising-resolution** is the complement along the axis of time.
It sharpens a **present, knowable** reality (現状理解).
`acting-on-hypotheses` bets and acts on an **uncertain future** (前進).
Both use "hypothesis", but they operate on different OBJECTS and interleave at the Map seam.
Cut by **VERB+OBJECT**:

- INSPECT a fixed present fact you can cite → `raising-resolution`;

- ACT to earn a confidence DELTA on an outcome that does not yet exist → Loop.

The interlock is **bidirectional**.
`raising-resolution` §4 names this skill as its forward-bet sibling and hands forward at its seam.
Braided tasks such as "will this scale?" legitimately co-fire.
Raise resolution on the present FIRST, THEN Loop the forward bet; the sequence does not race.
See `references/boundaries.md` for full routing and the worked braided example.
