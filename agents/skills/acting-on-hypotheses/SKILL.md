---
name: acting-on-hypotheses
description: >-
  Acts on ONE SELECTED hypothesis tree when an untested load-bearing bet carries expensive or
  hard-to-reverse work. Maps beliefs, runs the cheapest discriminating test with a prewritten
  threshold and outcome table, then Commit / Pivot / Kill. Use for 仮説検証, 仮説行動,
  Map-Loop-Leap, de-risk, or should-we-commit. Transfer requires target-side evidence; donor success
  is not evidence. Returns a
  `TARGET RESULT` to directing-research; never emits or reclassifies `MAPPING-BREAK`. Cuts: problem
  construction, admission, or multiple bets → directing-research; thesis genesis or mapping →
  forging-novel-theses; tacit premises → surfacing-blind-spots; present fact → raising-resolution;
  corpus → systematizing-knowledge; finished claim → arguing-research-papers. A deterministic,
  bounded, reversible probe without expensive downstream exposure uses the domain/plain executor.
  Sole owner of the selected tree's threshold, outcome table, and commit/pivot/kill. English skill;
  answer in the user's language.
---

# 仮説行動 — Map · Loop · Leap (act under irreducible uncertainty)

> **Scope**: A domain-neutral decision discipline (refactor, research direction, architecture choice,
> product bet — not startups only). Distilled from 馬田隆明『仮説行動』; the book is *lineage*, not
> *content to recite*. This file holds the precedence-setting CORE inline; phase technique and
> inter-skill routing live in `references/` and load on demand.
> **Build order (atomic).** This SKILL.md, its **5 reference targets** (map, loop, leap, boundaries,
> anti-patterns), `tests/triggers.md`, and `tests/forge-verification-ledger.md` ship together. Verify:
> `for f in map loop leap boundaries anti-patterns; do test -f references/$f.md || echo MISSING $f; done; for t in triggers forge-verification-ledger; do test -f tests/$t.md || echo MISSING "tests/$t.md"; done`

## Language

This skill is **English**. The deliverable you produce **defaults to the user's language (Japanese)**.
Keep the key terms as stable tokens even inside Japanese prose: 仮説行動, マップ・ループ・リープ,
確信度×影響度, 学びの最大化, Map / Loop / Leap, the load-bearing node, win/kill/loss,
**TARGET RESULT**, and **MAPPING-BREAK**.

## CORE — read every time (precedence-setting)

The model is a **GATE + 3 PHASES + a recurring stagnation check** — *not* "Map/Loop/Leap alone are
exhaustive". The GATE (STEP 0) decides whether this fires at all and whether the gap is
present-understanding or future-bet. The three phases are partitioned by **verb**, not by artifact.
The stagnation check recurs whenever Loop is running. THE LAW below overrides default behaviors and is
stated as law **only here**.

### THE LAW

> Under open-ended / uncertain / ambitious tasks you may **NOT** (a) freeze / over-ask / collect-more
> until "certain", nor (b) build a big-bang on unvalidated assumptions; you **MUST** Map → Loop → Leap,
> and you reach Leap only after Loop has retired the **fatal risks on the load-bearing node**.

Its authority is carried by three checkable sub-rules. **Each MUST emit a grep-able artifact** (mirrors
systematizing-knowledge's ledger-token discipline) — no artifact, rule not satisfied.

| # | Rule | What it inverts | ARTIFACT (must exist) |
|---|---|---|---|
| **R1** | **Anti-freeze.** Uncertainty is **not** a reason to ask the user or research more — it is a coordinate on the map telling you what to **TEST**. Convert every "I'm not sure" into a NAMED hypothesis node + the single cheapest discriminating action. | the model's default to ask / hedge | a named node with a **確信度×影響度** tag — *never* a clarifying question you could instead cheaply test |
| **R2** | **Anti-big-bang.** No code / design / decision that depends on an **untested load-bearing node** may be built at full scale before that node's cheapest test runs. Felt confidence ≠ earned confidence. | assuming confidence per-node | a **written pass/fail threshold** for the load-bearing node, set BEFORE acting |
| **R3** | **Falsify, don't flatter.** Before running ANY Loop test, write the two outcomes and the **different next-action** each implies. If pass and fail lead to the **SAME** next move, it is a **vanity test — FORBIDDEN, do not run it.** Aim the test at the belief most likely to be WRONG and most DECISIVE; treat disconfirming evidence as the win. | confirmation-shaped checking | a **two-row outcome→next-action table** per Loop iteration |

### STEP 0 — THE GATE (hard over-firing guard; this is the precedence top gate)

**Over-firing is the primary liability** — three-phase ceremony as "be-bold theater". Fire this skill
**only** when **a load-bearing belief is untested AND the work riding on it is expensive (>~1 reversible
session to build) OR hard to reverse.** Then run the cut and the cheapness rule:

- **The cut (vs raising-resolution).** Ask: *"Could a smart person, given enough primary info about
  what ALREADY EXISTS, know the answer?"*
  - **YES** → present-understanding gap → **raising-resolution** (if loaded; else a bounded inline
    resolution pass — see `references/boundaries.md` fallback — and do **not** relabel it a Loop).
  - **NO** → future-bet gap → continue.
  - Deterministic / known-method task → **just do it** (no ceremony).
- **The exposure cut.** Regardless of whether a tree has already been selected, route to
  **surfacing-blind-spots** when the requested verb is to expose hidden premises, ignored anomalies,
  unpublished failures, workarounds, or human tacit constraints. Return here only after those premises
  are explicit and the next verb is STRUCTURE / TEST / COMMIT. Do not call premise excavation a Map.
- **Cheap executor cut.** If no expensive-or-hard-to-reverse work rides on the result and the obvious
  probe is deterministic, known-method, bounded, and reversible inside one ordinary session, this skill
  does **not** fire. Send the probe to the domain owner or plain executor; it returns the raw result +
  provenance to `directing-research` for stage diagnosis. Do not manufacture a Map, threshold, or Leap.
  Conversely, a cheap discard-intent test that protects a later expensive/irreversible decision is a
  genuine Loop here: downstream exposure, not test price, is the tie-break.
- **Under-firing guard (subordinate to the gate).** When a load-bearing belief is untested AND the work
  is expensive-or-irreversible, fire **even if you feel confident** — felt confidence is not earned
  confidence (R2). "Felt confidence" can never justify ceremony on *routine* work; the gate wins.

### The three phases — verb-based seams (closes the Map/Loop overlap)

| Phase | VERB | Owns | Never does |
|---|---|---|---|
| **MAP** | **STRUCTURE & POSITION** | adds/removes/repositions nodes that still fit the selected tree, tags each 確信度×影響度, names the load-bearing node; **performs** integration/統合 (merging sub-maps) | produces no evidence; writes no test-derived confidence; does not excavate unknown premises or absorb a frame-breaking node |
| **LOOP** | **TEST & WRITE-VALUES** | the **only** phase that runs a test and **writes a confidence value** onto an EXISTING node; owns 学びの最大化 | never adds/removes nodes — if a test reveals a missing node, **FLAG** it and hand a cheap in-place Map pass the restructure |
| **LEAP** | **COMMIT & REALIZE** | the **only** phase that stakes a kept output and produces the outcome itself (仮説を正解にする); owns reversibility sizing (one-way vs two-way door); changes confidence only as a POST-COMMIT byproduct of reality | never runs a discard-intent probe (that is Loop's verb); never launders a cheap executor probe into a ceremonial commitment |

**Disambiguation — the object "hypothesis" has EXACTLY ONE role per phase** (exhaustive across the
three): **POSITIONED** (Map: a node placed in the tree + tagged) → **FALSIFIED** (Loop: a target a test
tries to kill) → **COMMITTED-AND-REALIZED** (Leap: the chosen bet you make true). *Tell:* placing /
structuring it? **Map.** Trying to kill it with a test? **Loop.** Staking on it to make it real? **Leap.**

**Disambiguation — the object "action" (Loop vs Leap), cut CATEGORICALLY by INTENT-AT-DESIGN** (not a
reversibility gradient): a **LOOP action** is one you pre-commit to **THROW AWAY** / not depend on
(scope sized to the **signal** — spike, throwaway MVP, concierge probe, one real run/user). A **LEAP
action** is one you pre-commit to **KEEP and BUILD ON** (scope sized to the outcome). A staged/reversible
Leap is **STILL Leap**, because you keep and depend on stage 1. *Tie-break tell:* "Did I pre-commit to
**discard** this (Loop) or to **keep-and-depend-on** it (Leap)?" There is no keep-possible exception:
a trial whose result has no expensive/irreversible downstream exposure was already routed out by
STEP 0; it does not become a Leap merely to preserve the phase taxonomy.

**Ordering is a dependency, not a waterfall.** Map → Loop → Leap; **Loop feeds back into Map** (a
surprising result triggers a Map restructure and can demote a planned Leap). A single iteration may
legitimately run **Loop (test) → Map (node-add)** — the verbs co-occur in one cycle; what stays separable
is the **ARTIFACT** (Loop emits `NEW NODE flagged by Loop iteration N`, Map places it — `references/map.md` §6), not
the wall-clock moment. The stagnation check recurs whenever Loop runs. Never skip Map → Leap without Loop
retiring the fatal risks on the load-bearing node.

## Procedure (STEP 0–4 + recurring check)

> Structure = GATE + 3 verb-phases + recurring stagnation check; not exhaustive (MECE-by-verb holds
> over the 3 phases only). Reversibility sizing is folded into LEAP's COMMIT verb, not its own step.

- **STEP 0 — GATE** *(owned here, above).* Apply the firing threshold, the cut, the cheapness rule.
  Route to raising-resolution / just-do-it / continue.

- **STEP 1 — MAP** *(draw, don't perfect — TIME-BOX is a first-class rule).* Write the overarching
  hypothesis as one falsifiable **言い切り**. Decompose into sub-hypotheses (build: value / feasibility /
  approach / integration / cost; research: claim / method / data / baseline). Tag each node
  **確信度(0–100%)×影響度**. Do it **ざっくり, then STOP** — set an explicit time-box and move; endless
  Mapping is a banned failure mode. Two scans: (a) low-確信度 nodes = what to test; (b) win/lose nodes =
  decisive. **Load-bearing node = max(uncertain × decisive).** If you cannot even NAME the nodes because
  the present is blurry → resolution gap, route per STEP 0. *Output:* the map + the single named node
  Loop attacks + any incoming `OPEN-SET RESIDUAL` copied unchanged with its provenance and observable
  reopen trigger. OPEN is never a node or a fact. (Technique → `references/map.md`.)

- **STEP 2 — LOOP** *(cheapest FALSIFYING test).* Plan in reverse **L→M→B**, execute **B→M→L**. Apply
  R3's outcome→next-action table FIRST (kill vanity tests). Pre-commit the pass/fail threshold; prefer
  an objective behavioral signal (a passing test, real attention/payment/time, a reproduced number) over
  self-reported enthusiasm. Build the minimum that yields the signal (sell-before-build / concierge /
  single spike). WRITE the confidence value onto the node; if a missing node surfaced, FLAG it and run a
  cheap in-place Map pass only when it still fits the selected tree. A frame-breaking discovery emits
  `FRAME-BREAK` with exactly one primary slot from
  `OBJECT / RELATION / OBSERVATION / REGIME / VALUE / ACTION / OPEN` and returns to
  `directing-research`; `VALUE` and `ACTION` are frame breaks, while `OPEN` remains an external residual
  until that sibling classifies it (Loop never edits structure). **STOP when fatal risks on the load-bearing node
  are retired — NOT at 100% confidence** (it never comes). On a multi-agent harness, only the probe's
  **Build→Measure** may run as a subagent under the probe contract (`references/loop.md` §8); the
  discrimination table, the pass/fail adjudication, the confidence write, and the Leap never leave your
  context — an agent's opinion is never a signal. (Technique + 学びの最大化 → `references/loop.md`.)

  **Transfer guard.** Copy the candidate ID, frozen transfer-bundle path/digest, donor-set locus, and
  correspondence locators from a selected transfer candidate. Begin with `target-side evidence:
  UNTESTED`. Test a target-side observable
  consequence of the preserved relation. Donor success, fluent analogy, and agent endorsement may motivate
  a test. They cannot move target confidence or satisfy its threshold. Return the outcome as a
  `TARGET RESULT` to `directing-research`; Loop never emits or reclassifies `MAPPING-BREAK`. If the
  observation calls the correspondence itself into question, request a new assessment from
  `forging-novel-theses`. Only that skill may emit a `MAPPING-BREAK`; `directing-research` then updates
  the disposition. The exact result contract is in `references/loop.md` §3. If the result becomes a
  durable reviewed repository artifact, `governing-research-documentation` governs only its locus,
  lineage, review, and retirement; it never changes the threshold or mapping meaning.

- **RECURRING — STAGNATION CHECK** *(runs whenever Loop is active — it has a home, not orphaned).* Is
  the hypothesis written and shared? Is the node-under-test named? Are you tuning on results, or
  perfectionism-stalling? **Two first-class exits:** (i) if the load-bearing node is **not falsifiable by
  any test you can actually run here** (no access to the real signal / it is a co-creation question),
  switch that node from FALSIFY-mode to **DIALOGUE/CO-CREATION-mode** or escalate that access is the
  blocker — do not felt-Loop an unrunnable node; (ii) **「回らないなら、いる場所が悪いのかも」** — if the loop
  structurally cannot turn, escalate the environment, don't churn.

- **STEP 3 — LEAP** *(evaluate → decide → realize → size reversibility — all ONE verb: COMMIT & REALIZE).*
  EVALUATE on **確信度(now earned)×影響度**; do not default to the safe small bet
  (**君の仮説は小さくまとまっている** — small-bet disease). Before committing WRITE the load-bearing triple:
  **win condition, kill/withdrawal condition, a survivable loss cap** (set BEFORE acting so sunk cost
  cannot rewrite them). DECIDE: state the chosen approach and why; commit. **SIZE REVERSIBILITY** (no
  longer a separate step — it is part of the COMMIT verb): a **two-way door** (reversible / bounded loss)
  → leap boldly even at mid confidence (asymmetric upside); a **one-way door** (irreversible / unbounded)
  → demand more Loop or restructure into staged/reversible commits. **大きく考え、小さく踏み出せ.** REALIZE:
  the behavior-changing rule is **honor the kill condition over sunk cost**; when reality diverges, adjust
  execution / pivot toward the goal before declaring the hypothesis dead (you can make a hypothesis true by
  execution). (Technique + the WIN/KILL/LOSS template + door-type checklist → `references/leap.md`.)

- **STEP 4 — OUTPUT in the USER'S LANGUAGE (Japanese):** the hypothesis map (nodes + 確信度×影響度),
  each Loop's outcome→next-action and what moved, the Leap decision with win/kill/loss conditions, and
  the current load-bearing open node. Also carry the incoming `OPEN-SET RESIDUAL` unchanged, including
  provenance + reopen trigger; if it fired, output the raw signal and `FRAME-BREAK` handoff instead of
  absorbing it into the tree.

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

**raising-resolution** — its complement along the axis of time: raising-resolution sharpens your view
of a **present, knowable** reality (現状理解); acting-on-hypotheses bets and acts on an **uncertain
future** (前進). They share the word "hypothesis" but operate on different OBJECTS and interleave at the
Map seam. The cut is by **VERB+OBJECT**: INSPECTING a fixed present fact you can cite = raising-resolution;
ACTING to earn a confidence DELTA on an outcome that does not exist yet = Loop. The interlock is now
**bidirectional** — raising-resolution §4 names acting-on-hypotheses as its forward-bet sibling and hands
forward at its seam (verified reciprocal pointer added). **Braided tasks ("will this scale?") legitimately
co-fire**: raise-resolution on the present FIRST, THEN Loop the forward bet — sequential, not racing. Full
routing + the worked braided example in `references/boundaries.md`.
