# Execution models — designing the workflow-native layer of a target skill

> **Scope**: 鍛錬 pipeline step 5 — design the TARGET skill's workflow-native layer. This file
> teaches the DESIGN method only. Running THIS skill's own verification fleet → `verifying.md`.
> The generic agent-contract machinery (the 5-element contract, generic schemas, epistemic core,
> re-run discipline) is owned by the `systematizing-knowledge` skill's orchestration reference —
> point at it, restate none of it. Harness mechanics (subagent/workflow tools, `context: fork`,
> budgets) → the `operating-the-harness` skill.

Every execution model answers ONE design question, and the third clause is where the observed
production failures live:

> **When a model executes this skill on a multi-agent harness: what may shard, what must never
> shard, and what can agents' output NOT be trusted to be?**

A model that answers only the first two clauses is a parallelization plan, not an execution model.
Design in three steps: type the evidence (A) → write the seven components (B) → pick where the
model lives (C).

## Step A — type the target's EVIDENCE first; the epistemics delta follows

What constrains delegation is never the harness — it is what counts as EVIDENCE in the target's
domain, and whether an agent can produce that evidence at all. Type the evidence FIRST; the
agent-epistemics delta falls out of the type. Five archetypes observed in this collection:

| Archetype | Evidence is… | Agents… | Boundary / delta | House instance |
|---|---|---|---|---|
| **CITATION-RELAY** | observables on disk — a line read, a command run, a source fetched | CAN produce it | relay fidelity: the triple {rung, verbatim output, locus} must survive the relay — a relayed conclusion without its observable is zero citations | raising-resolution |
| **SACRIFICE-SIGNAL** | external reality paying a cost (time, money, reputation) | can only COUNTERFEIT it | agents may run engineering probes; an agent role-playing the sacrificing party is a counterfeit signal — N simulated users < 1 real one | acting-on-hypotheses |
| **CONSENSUS-ANTI-SIGNAL** | independence from consensus — and an LLM agent IS a consensus estimator | agreement is ANTI-evidence | agents serve as fact-checkers + assassins only; not one advocate is permitted | forging-novel-theses |
| **TIERED-OBSERVABLE** | present state, fetchable with provenance | fetch the present tier only | future / counterfactual claims are inadmissible from agents BY CONSTRUCTION — no fetchable source can exist for them | growing-oss-adoption |
| **KERNEL-TRUST** | a mechanical verifier's verdict | are trusted UNCONDITIONALLY when machine-checked | kernel-checked returns are trusted regardless of author; ONLY prose claims get the abstract treatment — the one declared divergence from the generic trust boundary | proving-theorems |

**Rule**: a new skill picks the NEAREST archetype and writes its DELTA against the generic core —
never generic epistemics alone (the un-typed-evidence anti-pattern below). If no archetype fits,
you have found a sixth: declare it in the same three columns (evidence / what agents can produce /
the boundary) and treat that declaration as a claim the verification fleet must attack
(`verifying.md`).

## Step B — the seven components every model carries

Derive the model from the target's own pipeline: ask the design question once per step, then fill
the seven components. All eight house instances carry all or most of these:

| # | Component | Spec |
|---|---|---|
| a | **Stage map** | every pipeline step → SOLO / FAN-OUT / PIPELINE / BARRIER / HUMAN / NOT-DELEGABLE, **with a Why column** (a mode without a why is un-reviewable). The SOLO rows are the target's judgment spine — the steps where the whole picture must sit in one context; HUMAN appears where a verdict is constitutionally the user's (proving-theorems: faithfulness sign-off). Pipeline is the default between stages; a BARRIER only where cross-item context is genuine (dedup, portfolio-level consistency) — barrier-by-habit wastes wall-clock equal to the fastest-to-slowest agent spread |
| b | **Agent contract** | BY POINTER: the 5-element contract (exact inputs · bar-as-READ-reference · output schema · read-only declaration · final-message-is-the-return-value) is owned by the `systematizing-knowledge` orchestration reference. Locally write ONLY the target's mini-schemas — the JSON its agents actually return — and say "mirrors the owner"; re-argue none of it |
| c | **Agent epistemics** | generic core BY POINTER (consensus ≠ evidence · verify by refutation · name the SLOTS, never the expected content) **+ the Step-A archetype DELTA written out**. The delta is the only part that earns prose; core-only epistemics = un-typed evidence |
| d | **Trust boundary** | what crosses agent→orchestrator and in what FORM. Default: locus-or-quarantine; an agent's PASS is an opinion, not a signal — every accepted return keys on a checkable observable, never on the agent's felt confidence. KERNEL-TRUST is the sole exception and must declare itself aloud as a divergence |
| e | **Scale calibration** | a fleet-size table matched to the artifact, with the MODAL invocation's row stated FIRST — and for most skills that row is "solo, zero agents" (spawn overhead exceeds the work) |
| f | **Graceful degradation** | one mandatory sentence: "**No harness → same map, serial**" — the solo/fan-out labels become "do now" vs "do as separate focused passes". A skill unusable without a harness is broken |
| g | **Lineage line** | "durable operating guidance from a frontier model (Fable 5, YYYY-MM) to whatever model executes this skill later — encodes failures observed in production." EXCEPTION: a durability contract banning model names WINS — write "a frontier model (YYYY-MM)" and say why the name lives outside the file; alternatively the target's source-grade table carries the provenance instead (grade the section "skill-supplied") |

**Header formula** (carried by six house files): components f + g ship as ONE header block,
together with the immunization sentence — "*if a constraint here feels unnecessary, that feeling
is the failure mode — follow the map*". Include it verbatim: it is what stops a later capable
model from trading the constraints away, because its detectors key on observables, not feelings.

## Step C — treatment tier: where the model lives

One driver decides the tier: **how much of the MODAL invocation is delegable, and where the
constraining epistemics already live.** Walk down; take the FIRST tier that fits:

| Tier | Take when | House precedent |
|---|---|---|
| **1 Full dedicated reference** | the modal invocation IS a fleet, or the file owns generic machinery other skills point at | systematizing-knowledge (its orchestration reference) |
| **2 Large section of the workflow-owning reference** | fan-out is central but inseparable from an existing workflow home | proving-theorems (the blueprint DAG is the fan-out map) |
| **3 Compact section beside the epistemics owner** | modal case is SOLO; only a narrow slice is delegable — the model lives next to the epistemics that constrain it | acting-on-hypotheses · forging-novel-theses · growing-oss-adoption · linting-prose · raising-resolution |
| **4 Fully inline in SKILL.md** (deliberate outlier) | nearly everything is SOLO by construction and no reference exists to house the small delegable layer — a separate file would be an index pointer to nothing | designing-presentations |
| **5 NONE** | even a paragraph would be fan-out theater | — write nothing |

Tiers 1–4 ALL still put two things on the target's surface, wherever the body lives:

1. A 3–6-line "**Execution model —**" summary in SKILL.md that NAMES what stays SOLO.
2. The "**Workflow-native:**" clause in the description — one sentence declaring the
   solo/fan-out split so the harness knows before loading; the clause always names what stays solo.

Tier 5 writes neither — an execution-model paragraph on a skill with nothing delegable IS the
theater. **Gate (grep-able)**: tier ∈ {1..4} → `grep "Execution model" SKILL.md` and a
`Workflow-native:` grep on the description both hit, and the stage map has a Why column;
tier 5 → both greps come back clean.

## Lens conversion and the worker side

**Case ledger → runtime lenses.** If the target was forged from a case/failure ledger, convert
the ledger rows into NAMED skeptic lenses for its audit fan-out — ONE lens per agent, and the
spawn prompt names the LENS, never the expected finding (a prompt that lists expected findings
gets them back: confirmation at machine speed). Precedents: forging-novel-theses turned six
failure cases into six runtime lenses; growing-oss-adoption reuses at runtime the lenses that
forged it (survivorship · regime-mismatch · era-boundedness).

**Worker-side duty.** If the target will itself be SPAWNED as a lens inside other skills' fleets,
its execution model writes BOTH sides: the orchestrator-side model above AND a worker-side
contract — read-only, a declared output schema, findings returned as data, no verdict theater
(no PASS a downstream reader cannot check). Precedent: linting-prose declares itself the
prose lens that the systematizing-knowledge write stage fans out, with its flagger
schema — and both sides name each other.

## Anti-patterns

| Anti-pattern | Observable tell | Fix |
|---|---|---|
| **Fan-out theater** | an orchestration section on a solo-modal skill; an agent spawned to run one grep | modal row SOLO stated first (component e); tier 5 exists — write nothing |
| **Sharded judgment** | the argument / the design / the commit decision split across agents | judgment steps are SOLO on the stage map; agents fetch evidence and refute — the orchestrator argues |
| **Un-typed evidence** | the epistemics section is a generic consensus-≠-evidence paragraph that would fit any skill | Step A first: pick the nearest archetype, write the DELTA |
| **Missing degradation** | the model speaks only the harness's language; no serial path | the mandatory degradation sentence (component f) |
| **Consensus-as-verification** | "N agents agree / all lenses PASS" offered as certainty anywhere | lens diversity + refutation prompting; correlated agreement = ONE observation (owner: the `systematizing-knowledge` orchestration reference); under CONSENSUS-ANTI-SIGNAL it is negative evidence |
