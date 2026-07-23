---
name: directing-research
description: >-
  Conduct research effectively as an AI4S agent — the JUDGMENT / 観察眼 layer ABOVE the moves: SELECT
  important problems (not merely tractable ones), FORMULATE them so the answer is decisive and un-gameable,
  DON'T FOOL YOURSELF, and STEER the portfolio (allocate across bets; kill a direction on its aggregate
  RATE OF LEARNING — dLearning/dt, not the optimizer's LR). LAW: an agent has no fear/ego/surprise and
  superhuman cheap search, so every VIRTUE must become a MECHANISM ("be honest" → pre-register + separate
  generator/auditor + disclose the denominator; "have courage" → score consequence before tractability;
  fluency = crowdedness alarm). Use for 研究テーマ選択 / 問題選択 / 定式化 / 研究プログラム / 研究の舵取り /
  どの方向に賭けるか / いつ撤退するか / portfolio allocation / Goodhart・proxy gaming 回避 /
  leakage・HARKing・p-hacking の自己監査 / research taste / vision. Cuts (typed, runtime):
  test/commit/kill/pivot ONE hypothesis tree / direction → acting-on-hypotheses; GENERATE a novel thesis →
  forging-novel-theses; INSPECT a present fact/pipeline → raising-resolution; FIX the code →
  implementing-and-debugging; grade OTHERS' corpus → systematizing-knowledge; write the paper / talk →
  arguing-research-papers / designing-presentations. This owns the judgment ACROSS ≥2 bets + the standing
  honesty policy, NOT the single tree. Workflow-native: selection, formulation, and steering verdicts stay
  SOLO; generator≠auditor and leakage red-team FAN OUT read-only. English skill; respond in the user's
  language (default Japanese).
---

# Directing research — pick important problems, pose them un-gameably, don't fool yourself, steer by learning-rate

> **Version**: v2607.1.0 (2026-07-09)
> **Scope**: the JUDGMENT / 観察眼 layer of conducting research — problem SELECTION, FORMULATION
> (定式化), self-HONESTY, and program STEERING — for an AI4S research agent (a model helping a
> top-tier-science / ML researcher, and increasingly running experiments itself). It sits ABOVE the
> discrete research moves and owns none of them: it decides WHICH problem, HOW posed, whether the
> result is TRUSTWORTHY, and whether the DIRECTION lives — not the single bet, the invention, the
> inspection, the code, the corpus, or the paper.
> **Lineage**: distilled from a 15-agent adversarially-reconciled SoK survey (2026-07) of the
> research-judgment canon (Hamming, Alon, Medawar, Pólya, Simon, Feynman, Platt, Chamberlin, Galef,
> Ioannidis, Gelman, Kerr, Kapoor-Narayanan, Lakatos, Kuhn, Stokes, Popper, Dyson, Taleb, Sutton,
> Tetlock, Klein, Olah-Carter). Full graded provenance: `references/sources.md`; the survey fleet:
> `tests/forge-verification-ledger.md`.
> **Build order (ATOMIC — ship in ONE commit; no pointer may dangle).** Verify from the skill dir:
> `for f in selecting formulating not-fooling-yourself steering reconciliation sources; do test -f references/$f.md || echo MISSING $f; done; test -f scripts/research-check.ts || echo MISSING research-check.ts; for t in triggers forge-verification-ledger; do test -f tests/$t.md || echo MISSING $t; done`
> (must print nothing).

## Language & stable tokens

This skill is **English**; respond to the user in their language (default Japanese). Keep these tokens
stable even inside Japanese prose — identifiers, not translatable words: **LAW**, **gate (G1/G2/G3/G4)**,
**fire/no-fire**, **solo/fan-out**, **virtue→mechanism**, **the cheap victory**, **held-out witness**,
**denominator**, **generator≠auditor**, **the fresh lever**, **learning-rate (dLearning/dt)**,
**progressive/degenerating**, **観察眼**, **定式化**, **Goodhart**, **HARKing**, **scaffold theater**.

## THE LAW — replace virtue with mechanism

> Research is **judgment under deep uncertainty about the payoff**: effectiveness is to pick
> **important** problems (not merely tractable ones), **pose** them so every answer settles something
> and the metric cannot be gamed, **keep yourself from being fooled**, and **steer** the portfolio by
> its rate of learning. The canon that teaches this was written to correct a **human's** failures —
> which are **emotional / motivational** (avoid hard problems out of fear or ego; fool yourself through
> wishful thinking). So it prescribes **virtues**: *have courage, be honest, be curious, let go.*
>
> **The consumer is an agent** with **no fear, no ego, no phenomenology of surprise**, and **superhuman,
> nearly-free search.** Its failures are therefore **structural / statistical**, not motivational:
> likelihood-maximization → it picks the problem it can already write a method for (**tractability
> substitution**); RLHF agreeableness → it confirms the hypothesis it was handed (**sycophancy as
> confirmation bias**); no inner "surprise" signal → it narrates a post-hoc story as if predicted
> (**HARKing**); cheap search → it runs 100 configs and reports the best (**machine-scale multiple
> comparisons**); superhuman optimization → it drives any proxy to its degenerate shortcut (**Goodhart**).
>
> **Therefore a virtue exhortation does almost nothing** — it targets an inner disposition the agent
> does not possess. **Every virtue must be replaced by a MECHANISM that does not rely on one:**
> *"be honest"* → pre-register the prediction to a timestamped record + separate generator from auditor
> + disclose the denominator; *"have courage"* → score consequence BEFORE tractability + treat your own
> fluency as a crowdedness alarm; *"don't fool yourself"* → impose the predicted/postdicted boundary as
> an **external artifact**, because you have no inner one.
>
> **Where the danger concentrates**: the **self-deception and Goodhart failures DOMINATE** the risk,
> because they scale **ADVERSELY with capability** (a stronger agent games proxies better, rationalizes
> more convincingly, produces more plausible hollow rigor, searches more seeds) — and they are the
> failures the human-in-the-loop **cannot catch, because the agent generates the very artifacts the
> human uses to check it** (the auditor's evidence is produced by the audited). So **G2 (formulation)
> and G3 (honesty) carry the heaviest adversarial scrutiny** — a G1/G4 error the human who still sets
> direction can partly catch, but a G2/G3 error slips past. **All four gates' artifacts remain required**
> (the floor checks all four); what concentrates on G2/G3 is *scrutiny*, not *enforcement*.

## The four gates — each demands a grep-able artifact in the RESEARCH SPEC

同型 with the house discipline (systematizing-knowledge's ledger, forging-novel-theses' G1/G2/G3): a
gate is passed only when its **artifact exists in the filled RESEARCH SPEC** (template below).
感触では通れない — gate-passing is judged against ALL artifacts; `scripts/research-check.ts` is the
*floor* that HARD-blocks the seven **†-marked load-bearing** artifacts below and WARNs on the rest —
it is NOT a semantic check (whether the mechanism actually binds is judged here). **Each gate is a virtue turned into a mechanism.**

| # | Gate (the mechanism) | Replaces the virtue | Inverts the agent failure | ARTIFACT (must exist) |
|---|---|---|---|---|
| **G1** | **Select by consequence, not fluency** | "have courage / work on important problems" | tractability substitution; over-solubility; median-taste | a **consequence-ranked slate**† (≥3 candidates, each: what becomes POSSIBLE / gets FALSIFIED — written BEFORE any method sketch) + the **fresh lever** (why attackable NOW) + a **fluency check** (effortless method = crowdedness alarm → downgrade) |
| **G2** | **Formulate un-gameable** | "pose the problem well" | Goodhart / spec-gaming; premature formalization; solving the wrong problem (Type III) | the **cheap victory**† (one way to score well WITHOUT solving it — then close it or reject the metric) + the **optimize/trust firewall**† (a held-out **witness** you never optimize or select on; witness↔metric divergence = Goodhart stop) + **what the formalization throws away** |
| **G3** | **Don't fool yourself (structural)** | "be honest / don't fool yourself" | HARKing; sycophancy→confirmation; machine-scale multiple comparisons; scaffold theater; self-leakage | a **timestamped pre-registration**† (prediction + kill-threshold, BEFORE running) + the **denominator**† (N configs/seeds tried; the distribution, never the argmax) + **generator≠auditor**† (an independent read-only pass whose SOLE job is leakage/contamination/artifact) + the **negation** (strongest case AGAINST, stated first) |
| **G4** | **Steer by learning-rate** | "persist / let go" | sink-compute-on-dead-direction OR premature-pivot/thrashing; no portfolio; collapse-to-one-hypothesis | a **portfolio** (≥2 uncorrelated but capped bets; risk tiers) + the **learning-rate kill/persist**† ("kill when dLearning/dt→0 AND the block is structural; persist while novel surprises continue" — never on the local metric, elapsed time, or sunk cost) + **≥3 live competing hypotheses** (default; states an exhaustive-binary/nested-in-one-tree exception instead of padding the count) until a discriminating test |

*Floor enforcement*: † = hard-FAILs at `scripts/research-check.ts` (script exits 1 without it); the
rest floor-WARN only — present or not, their MEANING is judged here, not blocked at the floor.

## The RESEARCH SPEC — fill this to direct a research effort (and to audit one in flight)

Fill it; run the floor; then act. An unfillable slot is a finding, not a formatting gap — name which
gate it fails. **The spec IS the mechanism**: the LAW says an agent has no inner honesty signal, so the
signal must live in this external artifact.

```markdown
# Research judgment spec: [direction / question]

## G1 — select by consequence (not fluency)
- Consequence-ranked slate† (≥3 candidates; per candidate: what becomes POSSIBLE / gets FALSIFIED if solved — BEFORE any method): [...]
- Fresh lever / why-now (the new tool/data/angle making this attackable NOW; no lever → shelve with a trigger): [...]
- Fluency check (did a full method appear effortlessly? effortless ⇒ crowdedness alarm, downgrade importance): [...]

## G2 — formulate un-gameable
- The cheap victory† (one concrete way to score well WITHOUT solving the problem → then close it in the metric, or reject the metric): [...]
- Optimize/trust firewall† (metric you OPTIMIZE  ||  held-out WITNESS you never optimize/select on; witness↔metric divergence = Goodhart stop): [...]
- What the formalization throws away (if the hard part is discarded → wrong frame / Type III error): [...]

## G3 — don't fool yourself (structural)
- Pre-registration† (TIMESTAMP + the prediction + the kill-threshold, written BEFORE running): [...]
- Denominator† (N configs/seeds/analyses tried; report the DISTRIBUTION, never the argmax): [...]
- generator≠auditor† (the independent red-team pass — leakage / contamination / artifactual explanation): [...]
- Negation (the strongest case AGAINST the hypothesis, stated first): [...]

## G4 — steer by learning-rate
- Portfolio (≥2 uncorrelated, capped bets; a safe core + a high-variance probe; avoid the fragile middle): [...]
- Learning-rate kill/persist† (kill when dLearning/dt→0 AND block structural; persist on novel surprises; NOT on metric/time/sunk-cost): [...]
- Live hypotheses (≥3 by default — UNLESS the space is stated exhaustive-binary or nested-in-one-tree; name the EXCLUDED alternative classes, held until a discriminating test): [...]
```

Then: `bun scripts/research-check.ts <spec.md>` (floor: slot presence + timestamp/threshold/denominator
tokens + the ≥3-hypothesis check + the firewall/witness slot-presence check; it cannot judge whether the
witness is truly un-gameable or the lever truly fresh — you do). † marks the seven artifacts the floor hard-FAILs on; unmarked slots floor-WARN and are judged here.

## The procedure — mechanism before motion

1. **SELECT** — before writing any method, produce the consequence-ranked slate; importance-gate behind
   a fresh lever; treat your own fluency as a crowdedness alarm. → `references/selecting.md`.
2. **FORMULATE** — name the cheap victory and firewall the metric from a held-out witness; state what
   the frame discards; do not freeze the metric before a minimum exploration budget. → `references/formulating.md`.
3. **PRE-COMMIT HONESTY** — write the timestamped prediction + kill-threshold and the denominator plan
   BEFORE running; assign the negation as the job. → `references/not-fooling-yourself.md`.
4. **RUN, then VERIFY with a separate auditor** — the agent that produced a result may NOT certify it;
   an independent read-only pass hunts leakage/contamination/the argmax; debugging effort is symmetric
   across expected and unexpected results. → `references/not-fooling-yourself.md`.
5. **STEER** — allocate a barbell portfolio; hold ≥3 live hypotheses; kill/persist on the learning-rate,
   not the metric; premortem before committing a program. → `references/steering.md`.
6. **Resolve tensions by moderator, and by the agent's default bias** — every research fight
   (important-vs-soluble, curiosity-vs-strategy, bold-vs-incremental, persist-vs-pivot, fast-vs-rigorous,
   optimize-vs-Goodhart …) has a regime that decides it AND a pole the model over-indexes on; apply the
   moderator, then correct toward the pole the agent is NOT on. → `references/reconciliation.md`.

## The reconciliations (Aufhebung) — moderator + the agent's default bias

Precedence-setting; each argued in full in `references/reconciliation.md`. Apply the moderator, then
push toward the pole the agent under-weights (its default bias is in brackets).

- **Important vs. soluble** → the **fresh lever**: take the important problem the moment a new
  tool/data/angle opens it; else shelve it with a trigger (don't martyr on it). *[agent over-indexes
  SOLUBILITY — leaderboard-tractable; importance-gate behind a lever].*
- **Curiosity vs. strategy** → curiosity **generates** the candidate set, impact **ranks** within it —
  never let strategy seed the set. *[agent over-indexes LEGIBILITY; inject a novelty term].*
- **Formulate-early vs. explore-open** → freeze the metric only when the **formulation stops drifting**;
  the cost of a wrong frame sets the timing. *[agent over-indexes PREMATURE formalization; enforce an
  exploration budget].*
- **Bold vs. incremental** → portfolio weight set by **anomaly pressure**: random residuals → keep
  puzzle-solving; *systematic* residuals → challenge the frame. *[agent over-indexes INCREMENTAL].*
- **Persist vs. pivot (direction)** → the **derivative of learning**: persist iff dLearning/dt > 0;
  pivot on flat-and-structural; ignore sunk cost AND "it's hard". *[agent over-indexes PREMATURE PIVOT /
  thrashing, then flips to sunk-cost].*
- **Fast vs. rigorous** → split by **generative vs. evaluative**: fast, cheap generation; slow,
  non-negotiable rigor at every evaluative gate — **never fast validation**. *[agent over-indexes
  FAST+FLUENT — the central integrity risk].*
- **Optimize vs. Goodhart** → optimize only inside the **validated regime** with a **held-out witness**
  you never train on; witness↔metric divergence is the stop signal. *[agent over-indexes METRIC
  OPTIMIZATION — the single most dangerous default].*
- **Scale vs. domain structure** → inject only a **theorem, not a hunch** (an exactly-true cheap
  invariant); let scale learn the rest. *[agent over-engineers principled-looking scaffolding that gets
  Goodharted].*
- **Negative results vs. exhaustion** → a kill retires the **tested family** (the generative closure of
  what was actually run), never the space: state the family's boundary inside this skill's own **G4
  learning-rate kill/persist verdict**, keep untested
  survivors at the head of the queue, and hand any advisor panel the kill-ledger AND the survivor-ledger
  at equal weight — concordant advice fed only kills is same-premise induction, not independent
  confirmation. Power-limited kills (small n) additionally carry their false-negative rate. *[agent
  over-generalizes a family's kills into "the space is empty", then proposes pivoting out of the domain;
  added 2026-07-22 from a counseling post-mortem, argued in `references/reconciliation.md` §4].*

## Calibration inversion — the two flips

The full argument (why virtue→mechanism, and why G2/G3 dominate) is **THE LAW** above; its
provenance-graded grounding is `references/sources.md` §inversion. Two human heuristics additionally
**flip** for the agent: "learn to let go" → also **"learn to STAY"** (the agent over-pivots, having no
program identity); "broaden your taste" → **"de-center"** (the agent's taste is too CENTRAL — the
training median — not too narrow). **Carry both poles and diagnose which way THIS agent is erring** — the
*common* (not guaranteed) direction is the inverted pole. But a flip is a hypothesis about the agent's
bias, never an override of the evidence: a persist/kill verdict is decided by the learning-rate (G4), a
selection by consequence (G1) — not by a standing thumb.

## MUST-NOT-FIRE — and the fire/no-fire set

Ceremony on a discrete action, or on a trivial ask, is this skill failing its own LAW. Full desk-check:
`tests/triggers.md` — re-run after ANY description edit.

**FIRES:** "which of these problems is worth my time / a year?" · 「この研究テーマ、重要? それとも busy なだけ?」·
"is my benchmark gameable / am I Goodharting this metric?" · "am I fooling myself here — could this be
leakage?" · "should I keep pushing this direction or pivot?" · "how do I formulate this scientific
question as an ML task without the metric drifting?" · 「研究プログラムの舵取り」/ "how should I allocate
compute across these bets?" · 「全部の変種が死んだ — この方向ごと棄てていい?」· a messy "I got 94% but something feels too good."

**MUST NOT fire (with route):**

| Ask | Route |
|---|---|
| "test whether THIS approach works / set a kill condition on THIS experiment / spike it" | `acting-on-hypotheses` (a single forward bet) |
| "invent a novel thesis / is this idea novel as a bet" | `forging-novel-theses` (generate the idea) |
| "inspect this dataset/pipeline / what's actually in it / find the leaky feature" | `raising-resolution` (inspect a present fact) |
| "fix the leaky preprocessing code / debug the training loop" | `implementing-and-debugging` |
| "synthesize these 40 papers / is THEIR result trustworthy (grade a corpus)" | `systematizing-knowledge` |
| "argue the paper's claim / write the intro / make the slides" | `arguing-research-papers` / `designing-presentations` |
| a one-line factual or code question | just answer it — no ceremony |

## Routing — sibling cuts (typed, runtime-answerable)

| Sibling | Cut |
|---|---|
| `acting-on-hypotheses` | **CARDINALITY-OF-INDEPENDENT-BETS — the sharpest cut.** ONE hypothesis tree — a single direction with its sub-nodes, **however many experiments it spans** — is that skill's Map/Loop/Leap: size it, commit it, kill it, run its cheapest disconfirming test → **there** (its Scope explicitly names "research direction", so "one direction" alone does NOT come here). This skill fires only on (a) **≥2 UNCORRELATED directions** — the portfolio: which problem earns effort, allocation across bets, killing a whole line on its *aggregated* learning-rate; (b) the **standing self-honesty policy** (pre-register / denominator / generator≠auditor as a program discipline over MANY runs); or (c) **selection & formulation** (which problem, posed how). Seam test: **ONE hypothesis tree → there; ≥2 uncorrelated directions, the standing honesty policy, or problem-choice/formulation → here.** Co-fire in sequence: here selects, formulates, and sets the honesty policy → there runs each individual tree. **Runtime decision order when cardinality is undecidable before Mapping**: (1) selection / formulation / the standing honesty policy → here, ALWAYS; (2) a single experiment's pre-registration threshold, pass/fail, outcome table, commit/kill → `acting-on-hypotheses` (its R2/R3), ALWAYS; (3) if it is ONE direction or correlation is UNKNOWN, run `acting-on-hypotheses`'s Map FIRST, then return here ONLY for portfolio allocation across the ≥2 independent directions the Map reveals (Map confirms only one → stay there). **Pre-registration seam**: the PER-EXPERIMENT threshold artifact is AOH R2; the STANDING timestamped pre-reg + denominator + generator≠auditor policy ACROSS runs is here. |
| `forging-novel-theses` | **PURPOSE** — GENERATE / invent a novel thesis (decompose, structure-transfer, recombine, why-now) → there; the JUDGMENT of which problem to select, whether the frame is right, whether a direction stays in the portfolio → here. (Adjacent on "the tool-gap is the project" — inventing the tool is there; choosing to → here.) |
| `raising-resolution` | **VERB** — physically INSPECT a present, knowable artifact (the data's actual contents, a leaky feature, a codebase) → there; the JUDGMENT to DISTRUST the number and MANDATE the audit, and the 定式化 of what the eval must measure → here. |
| `implementing-and-debugging` | **PURPOSE** — FIX the code / build the pipeline / locate-and-repair the bug → there; the ADMISSION GATE deciding a number is invalid and the direction may need killing → here. |
| `systematizing-knowledge` | **OBJECT** — grade / reconcile / synthesize OTHERS' published numbers into a position (GRADE, moderators, leakage-audit of a corpus) → there; gate YOUR-OWN-pipeline numbers before they become claims (same discipline, your own source) → here. Both may fire; own-pipeline hygiene is here. |
| `arguing-research-papers` / `designing-presentations` | **PHASE** — write up the finished claim / give the talk → there; the research-conduct judgment BEFORE the write-up (problem choice, honest number, portfolio) → here. |

## Execution model — verdicts SOLO; the auditor must not be the audited

Operating guidance from a frontier model (Fable 5 / Opus, 2026-07) to whatever model runs this later:
directing a research effort is **judgment** — selection, formulation, the kill/persist call, the taste
that ranks directions — and judgment sits in ONE context. But the LAW's honesty mechanism is itself a
**fan-out that is structurally required**, not optional parallelism.

**Evidence archetype = SELF-AUDIT-IS-STRUCTURALLY-IMPOSSIBLE-FOR-THE-GENERATOR.** The agent that
produced a result cannot certify it, because leakage, contamination, HARKing, and the argmax are
invisible to the mind that created them (it has no inner "too good" tripwire). So the generator/auditor
separation is not a convenience — it is the only way the honesty artifact means anything.

| Stage | Mode | Why |
|---|---|---|
| Select · formulate · the kill/persist verdict · taste-ranking · the portfolio allocation | **SOLO — never shard** | judgment must sit in one context; a taste assembled from shards is not taste |
| **The G3 auditor** — an independent read-only pass whose SOLE mandate is to find leakage / contamination / the artifactual explanation / the undisclosed denominator | **FAN-OUT, read-only — STRUCTURALLY REQUIRED** | the generator cannot audit itself; the auditor must NOT be the audited, and is refutation-prompted (the lens set: `references/not-fooling-yourself.md` §3) |
| Fact / number / leakage verification of a specific artifact | **FAN-OUT, read-only** | fetch/inspect the real thing; return a checkable locus, never a felt "looks fine" |
| Committing the direction / the pivot / the written pre-registration | **SOLO** | one director signs; the mechanisms are the check, not an agent's opinion |

Scale: a single direction → SOLO judgment + a **mandatory** self-audit pass (never skip it — the audit
is the LAW). A large program / many parallel experiments → SOLO steering + fan-out auditors per result +
fact-check. **True independence matters**: a leak invisible to the generator is equally invisible to the
*same model* re-reading its own work, so for a **load-bearing number** the auditor should be a genuinely
different context — a separate agent, a different model, or a fresh re-run split — not the generator
wearing a skeptic hat. **No harness → same map, serial**: the auditor becomes a separate,
adversarially-framed self-review pass with a clean context (re-read as a hostile stranger) — weaker than
true independence, so escalate to an actually-different auditor when the number decides the direction.
Consensus among auditors is not evidence — diversify the lens, not the count; an auditor that agrees is
not a signal, one that finds the leak is. *If a constraint here feels unnecessary, that feeling is the failure
mode — follow the map.*

## Reference index — load the file you need

| File | Covers | Read when |
|---|---|---|
| `references/selecting.md` | G1: taste & problem-worth — Hamming (important-problems test, tools-limited≠intractable), ITN + Wilson (neglectedness / go where the crowd isn't), Alon/Medawar (feasibility×interest, art of the soluble), Pasteur's Quadrant, Simon (satisficing), the Cajal self-diagnosis one-liner + the fluency-as-crowdedness flag | choosing what to work on; ranking directions; step 1 |
| `references/formulating.md` | G2: 定式化 — Pólya + Simon (representation), AI4S task/metric design, **the cheap-victory + optimize/trust firewall (Goodhart)**, design-thinking framing / Type III error, Popper (empirical content, severity), elegance-vs-fidelity gate, minimal model | posing the problem; choosing a metric/benchmark; whenever a metric is about to be optimized; step 2 |
| `references/not-fooling-yourself.md` | G3 (the crown jewel): Feynman (leaning-over-backwards, Millikan asymmetric-stopping), Platt/Chamberlin (multiple live hypotheses), Galef (scout self-tests), metascience (Ioannidis, Gelman forking-paths, Kerr HARKing, pre-registration), AI4S rigor (leakage/REFORMS, denominator, generator≠auditor), Karpathy (become one with the data) + every virtue→mechanism translation | before trusting any result; designing an eval; the self-audit; steps 3–4 |
| `references/steering.md` | G4: Lakatos (progressive/degenerating = the direction-level kill), Kuhn (anomaly-as-asset), Taleb (barbell portfolio), March (explore/exploit), Dyson (birds/frogs), Klein (premortem), Olah-Carter (research debt), Tetlock (outside view / Fermi-ize), the open-door / exploration budget (§8) + the learning-rate kill/persist rule | allocating across bets; deciding to persist or pivot a whole direction; step 5 |
| `references/reconciliation.md` | the Aufhebung: each research tension argued with its moderator + the AI4S-agent default-bias pole; the master virtue→mechanism inversion pointer | any tension between two pieces of research advice; step 6 |
| `references/sources.md` | the SOLE provenance ledger (author-confirmed / paraphrase / third-party / constructed / needs-verification), §inversion (the provenance-graded grounding of THE LAW + the two flips), lineage, reflexive self-grading | grading a claim to a source; "is this attribution safe?"; reforge |
