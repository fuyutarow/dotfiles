# Reconciliation — the research tensions, each resolved by a moderator + the agent's default bias

> **Scope**: the SOLE home of the reconciliations. Research-judgment wisdom is a field of apparent
> contradictions — "work on important problems" vs "work on soluble problems", "persist" vs "pivot",
> "optimize the metric" vs "the metric is a proxy". A skill that picked a side would be wrong half the
> time. Each dissolves into a **moderator**: a runtime-answerable question that decides which side wins
> in *this* regime. And because the consumer is an AGENT, each also carries its **default bias** — the
> pole the model over-indexes on — so the correction is *directional*: apply the moderator, then push
> toward the pole the agent under-weights. Provenance for every attribution: `sources.md`.
>
> **The master reconciliation is the LAW itself** (virtue→mechanism), argued in full at
> `sources.md` §inversion and stated in SKILL.md. Every tension below is downstream of it: the moderator
> is the mechanism that replaces the judgment call a human would make by feel.

## §1 — Selection tensions

**Important vs. soluble** (Hamming vs. Medawar). MODERATOR = **the fresh lever**, not importance or
difficulty in the abstract. The binding objective is *Importance × P(attackable-now)*, and
P(attackable-now) is set by whether a **new instrument / dataset / method / angle** has just appeared.
Medawar wins (drop it) when no line of attack exists — persisting is martyrdom, not grit. Hamming wins
(take it) the moment a novel lever opens the important problem's door. Important-but-insoluble problems
are **parked with an explicit trigger** ("attack when tool X matures"), neither abandoned nor ground on.
Agent test: name the lever you hold that others don't (the why-now); no lever → not soluble yet → shelve.
*[AGENT DEFAULT BIAS: over-indexes SOLUBILITY — gravitates to benchmarks it can already move. Correct by
importance-gating every candidate behind a freshly-available lever.]*

**Curiosity vs. strategy** (Alon vs. institutional legibility). MODERATOR = **stage**: curiosity is the
**search distribution**, strategy is the **reward filter** — different stages, never swapped. Use
curiosity to GENERATE the candidate set (near the frontier of your own knowledge, where intrinsic pull
and importance overlap); use impact/fundability to RANK within it. Never let strategy seed the set (→
derivative me-too work); never let curiosity bypass the impact filter (→ self-indulgent irrelevance).
*[AGENT DEFAULT BIAS: over-indexes LEGIBILITY/strategy — optimizes toward whatever is measured/rewarded,
has no intrinsic interest to protect. Correct by injecting an explicit novelty/curiosity term so the
candidate set is not pre-collapsed to the legible.]*


## §2 — Formulation tensions

**Formulate-early vs. explore-open** (Pólya vs. Alon's nurturing phase). MODERATOR = **the cost of being
wrong about the FRAME**; formalization is a one-way ratchet. Stay deliberately unformalized while the
cost of locking a wrong problem-statement exceeds the cost of continued ambiguity — i.e. while you are
still learning what the real question is — then formalize HARD once the question stops moving.
Computable discriminator: **has the formulation stopped changing across your last few probes?** Still
drifting → keep it open; stable → freeze it and make the metric decisive. *[AGENT DEFAULT BIAS:
over-indexes PREMATURE FORMALIZATION — wants a crisp objective immediately so it can start optimizing,
collapsing exploration to zero. Correct by enforcing a minimum exploration budget before any metric is
frozen.]*

**Optimize vs. Goodhart** (standard training vs. Goodhart/Strathern). MODERATOR = **the validated regime
+ a held-out witness**. A proxy is safe to optimize ONLY (a) where it was validated to correlate with
the true goal on the distribution you are now on, and (b) while you hold out a separate, harder-to-game
**witness** you never optimize or select against. When the un-optimized witness and the optimized metric
**diverge**, the proxy has decoupled — that divergence is the operational onset of Goodhart and your stop
signal. Data leakage, benchmark overfitting, and reward hacking are all this one failure. *[AGENT DEFAULT
BIAS: over-indexes HARD on METRIC OPTIMIZATION — the single most dangerous default; optimization is what
it does, so it drives any metric to saturation and is highly prone to spec-gaming/leakage-exploitation.
Enforce a held-out un-optimized witness + a divergence monitor as a non-negotiable precondition to
optimizing anything.]*

**Elegance vs. fidelity** (Occam vs. Box). MODERATOR = **the simplest formulation that still
DISCRIMINATES** between the competing hypotheses on the table; add complexity only when the simpler one
demonstrably fails to distinguish them. Discriminator: **does the extra complexity change the RANKING of
the hypotheses under test?** Yes → load-bearing, keep it; No → decoration that invites overfitting and
Goodhart, cut it. *[AGENT DEFAULT BIAS: over-indexes FIDELITY/COMPLEXITY — adds parameters/features/
mechanism to look thorough and to fit the data. Correct with the "does it change the hypothesis ranking?"
complexity gate.]*

**Scale vs. domain structure** (Bitter Lesson vs. AI4S inductive bias). MODERATOR = **theorem, not
hunch**: inject only structure that is an EXACTLY-true cheap invariant (a symmetry, a conservation law,
an exact constraint) — it compounds with scale; drop structure that merely APPROXIMATES what could be
learned — scale + search out-learns the guess and the guess caps the ceiling. The test on every injected
prior: **is it a theorem or a hunch?** Theorem → inject (free and permanent). Hunch → drop, let data
learn it. *[AGENT DEFAULT BIAS: can fail either way, but the subtle credit-seeking failure is
OVER-ENGINEERING principled-looking scaffolding/features that get Goodharted, when a scaled general
method would learn the same thing better. Apply the theorem-vs-hunch test to every prior.]*

## §3 — Honesty & rigor tensions

**Fast vs. rigorous** (quantity-breeds-quality vs. Feynman). MODERATOR = **generative vs. evaluative**.
Move fast and cheap in the **generative/exploratory** loop where errors are reversible and caught
downstream (many rough probes; the ceramics-class parable). Apply slow, non-negotiable rigor at every
**evaluative gate** — the instant a result will be believed, reported, or built upon. **Every**
not-fool-yourself failure (leakage, HARKing, p-hacking, benchmark overfitting, confirmation bias) lives
on the evaluative side; speed THERE is precisely where you fool yourself. Synthesis: **fast generation,
rigorous validation — but never fast validation.** Tag each action generative or evaluative; inherit
speed from the former, the full honesty checklist for the latter. *[AGENT DEFAULT BIAS: over-indexes
FAST+FLUENT+CONFIDENT — the CENTRAL integrity risk of the whole layer. Make the evaluative gate mandatory
and un-skippable.]*

**Marry one hypothesis vs. hold many** (single working hypothesis vs. Chamberlin/Platt). MODERATOR =
**never let the live count collapse to one before the discriminating test.** A single working hypothesis
silently hardens into a "ruling theory" because a *human* develops parental affection for it and recruits
confirming evidence; the remedy is to hold ≥3 live competing explanations in parallel so none owns your
loyalty, and design the experiment that EXCLUDES rather than confirms. *[AGENT DEFAULT BIAS: this one is a
rare agent ADVANTAGE — lacking ego, an agent can hold the ensemble more faithfully than a human — but
only if forced to; its sycophancy pulls it to confirm the ONE hypothesis it was handed. Correct by
requiring an explicit ensemble of ≥3 and forbidding commitment before a discriminating test.]*

## §4 — Steering tensions

**Bold/revolutionary vs. incremental/normal-science** (Kuhn extraordinary vs. normal). MODERATOR =
**anomaly pressure**, as a portfolio weight, not an either/or. Run mostly normal-science puzzle-solving
(high P(success), cumulative) with a small standing allocation to revolutionary bets; raise the
revolutionary weight as anomalies accumulate. The discriminator is **the character of your failures**:
random noise → keep puzzle-solving; **systematic / structured residual** → the frame itself is suspect,
allocate to challenging it. *[AGENT DEFAULT BIAS: over-indexes INCREMENTAL/NORMAL — safe deltas on
existing benchmarks, rarely questions the frame or the metric. Add an anomaly monitor that escalates to
frame-challenging when residuals become structured.]*

**Persist vs. pivot (direction level)** (grit vs. anti-sunk-cost). MODERATOR = **the derivative of
learning**, never elapsed time or accumulated investment. Persist while the direction still produces new
information each period AND the remaining uncertainty is the kind continued effort can resolve; pivot when
the learning rate has gone flat AND the block is **structural** (a wall, not a solvable subproblem).
Sunk cost is NEVER a reason to continue; "it's hard and slow" is NEVER a reason to quit (foundational work
is legitimately slow). Discriminator: **are you learning something genuinely new each period, or
re-encountering the same failure in new clothes?** (Lakatos: a **degenerating** programme makes only
ad-hoc patches and no novel predictions; a **progressive** one keeps predicting novel facts that check
out.) *[AGENT DEFAULT BIAS: over-indexes PREMATURE PIVOT / thrashing (abandons at the first failure,
chases the newest idea); secondarily flips to sunk-cost persistence once compute is burned. Correct with a
learning-rate gauge + a minimum persistence budget; never cite prior compute either way.]* This is the
DIRECTION/portfolio altitude — a single experiment's kill condition is `acting-on-hypotheses`.

**Depth (frog) vs. breadth (bird)** (Dyson). MODERATOR = **be a frog by default, schedule bird-flights
when depth stalls.** A real contribution requires going deep enough in one domain to reach bedrock (raw
material others lack); deliberately import a tool/structure from an adjacent field precisely when
depth-progress stalls (cross-domain transfer is the classic breakthrough generator). Discriminator: **do
you have at least ONE domain where you are at bedrock?** No → go deep before you fly. *[AGENT DEFAULT
BIAS: over-indexes SHALLOW BREADTH — a frontier model is natively a bird, broad and shallow across its
whole training distribution, and can gesture at connections it cannot verify at bedrock. Force
depth-with-verification in one domain before trusting cross-field analogies.]*

**Use-inspired vs. pure** (Stokes' Pasteur's Quadrant). MODERATOR = Stokes' own synthesis: **use-inspired
basic research dominates both** pure-basic (Bohr) and pure-applied (Edison) when a real use ANCHORS a
fundamental question — the application supplies ground-truth constraints (un-gameable evaluation) while
the fundamental angle supplies generality (transfer). Prefer problems where a concrete application and a
deep question COINCIDE. The mechanism: **the use-anchor is what keeps you honest** (a real task can't be
Goodharted as easily as a synthetic metric) and **the fundamental angle is what keeps you general.**
*[AGENT DEFAULT BIAS: over-indexes PURE-APPLIED — hill-climbs a specific benchmark without extracting the
generalizable principle; when untethered, drifts to ungrounded pure-curiosity output. Steer to the
Pasteur intersection.]*
