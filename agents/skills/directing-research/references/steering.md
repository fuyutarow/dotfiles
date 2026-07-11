# Steering — running the program by learning-rate, not by the metric (G4)

> **Scope**: the SOLE home of G4 — steering a research PROGRAM over time: the portfolio of bets, the
> direction-level kill/persist call, and the allocation of effort. **The sharpest cut is with
> `acting-on-hypotheses`**, which owns the SINGLE bet (size it, commit it, kill it, run its cheapest
> disconfirming test). Here is the **altitude above** it: which problems stay in the portfolio, how
> compute is allocated across many bets, and whether a whole DIRECTION lives — decided on the
> **aggregated learning-rate**, not one experiment's pass/fail. Provenance: `sources.md`.

## §1 — The learning-rate kill/persist rule (the direction-level decision)

Agents follow local plausibility — each next tweak is individually reasonable — so they either **sink
compute into a dead direction** (no meta-level "this whole approach is dead") OR, chasing a "progress"
signal, **thrash and abandon** a direction on its first negative result. Both come from steering on the
**local metric** with no altitude.

> **The discriminator: a direction is ALIVE while it is still reducing uncertainty (high bits gained per
> unit compute), even if its metric is bad; it is DEAD when learning has stalled — slowly-improving
> numbers but no new understanding, only ad-hoc post-hoc patches.**

This is **Lakatos**: a **progressive** research programme, after patching a theory to survive an anomaly,
has the patch **predict a NOVEL fact that then checks out**; a **degenerating** one only re-explains the
anomaly that forced it (ad-hoc, no novel predictions). The program-level analogue of HARKing/overfitting:
gate every patch on **out-of-sample novelty** — does it predict a held-out phenomenon it wasn't fitted to?
If not, it is Ptolemaic curve-fitting.

**The rule** (the SPEC's G4 kill/persist slot): **kill when dLearning/dt → 0 AND the blocking obstacle is
STRUCTURAL** (a wall, not a solvable subproblem); **persist while novel surprises keep coming.** Never kill
on a bad metric alone; never persist on a slowly-rising metric that teaches nothing. **Ignore sunk cost
entirely** ("we've invested so much" is not a reason to continue) AND **ignore "it's hard and slow"**
(foundational work is legitimately slow — abandoning at the first failure is thrashing). Computable tell:
**are you learning something genuinely new each period, or re-encountering the same failure in new
clothes?** (Full regime + the agent's premature-pivot bias: `reconciliation.md` §4.) A single experiment's
kill condition is `acting-on-hypotheses`; this aggregates across many to decide the whole direction.

**The learning ledger — making dLearning/dt computable, not felt.** "Still learning" is unfalsifiable
without a record: **dLearning/dt is ESTIMATED from a ledger, never felt** — a direction with no ledger
cannot claim to be still learning. Keep one row per period:

| Period | Compute/time spent | Learning events (facts established / predictions that FAILED / alternatives RULED OUT) | Hypothesis-space delta (now believed that wasn't; what DIED) | Structural-block evidence (if any) |
|---|---|---|---|---|
| e.g. wk3 | 40 GPU-h | 0 facts, 0 failed predictions, 0 ruled-out | none | none |

**Pre-set the kill threshold in these terms, before the period starts, not after** — e.g. *"2
consecutive periods with zero ruled-out alternatives AND zero failed-prediction surprises → kill."* A
period that only re-confirms what you already believed is a zero-row even if the metric ticked up.

## §2 — The barbell portfolio (allocate across bets)

Without an explicit allocation policy the agent defaults to **all-in on one bet** (fatal if it dies) or
**scatters uniformly** (none reaches signal), and it optimizes whatever local number is in front of it
rather than the program's rate of learning.

**Mechanism** (the SPEC's G4 portfolio slot), Taleb's **barbell**: a **safe core** (incremental,
cumulative, high-P(success) puzzle-solving) plus **many cheap, capped-loss, high-variance probes** (lottery
tickets with positive optionality) — and **avoid the fragile middle** (moderate bets carrying hidden tail
risk and little upside). Prefer **convex** experiments where you gain asymmetrically more from a surprising
tail than you lose from a dud, so variance works FOR you. This is almost custom-built for an agent whose
**marginal experiment cost is near zero**: run a wide fan of independent cheap probes, each with a hard
kill/loss cap, precisely where convex tinkering pays.

Constraints: **≥2 UNCORRELATED bets** so no single death is fatal, but **CAPPED** so none is starved;
declare the **risk tiers**. The optimization target at program level is the **learning rate** (information
gained per unit compute), not any one experiment's metric — **rebalance toward the bets whose information
yield is rising** (March's explore/exploit, at the portfolio altitude). The bold-vs-incremental mix is set
by anomaly pressure (`reconciliation.md` §4).

## §3 — Anomaly as asset (Kuhn), coupled to Lakatos

Normal science is puzzle-solving guaranteed a solution inside the paradigm; a **persistent anomaly** the
paradigm keeps failing to digest is where paradigm-shifting problems live. **Do NOT auto-discard systematic
residuals / recurring benchmark failures / consistent OOD breakage as noise** — a residual that resists
every within-paradigm fix is a candidate paradigm-crack to escalate and mine. **The coupling rule**:
escalate an anomaly to frame-challenging **only once within-paradigm patches have gone DEGENERATING** (§1)
— a programme can survive single anomalies and still be progressive, so a lone anomaly never kills a
frame; a *stream* of anomalies that only ad-hoc patches can absorb does. (Verifying the anomaly is real and
not instrument error is `raising-resolution`; GENERATING the replacement paradigm is `forging-novel-theses`;
the JUDGMENT that a reproducible anomaly is worth reorienting the program toward is here.)

## §4 — Match cognitive style, treat new tools as windows (Dyson)

**Birds and frogs**: birds survey broadly and unify across fields; frogs dig deep into one problem's
structure — neither is superior. Match the problem TYPE to the mode, and for a program/portfolio,
**deliberately staff both** — an all-frog program local-optimizes, an all-bird program stays shallow (the
agent's native bias is bird/shallow-breadth; force depth-with-verification — `reconciliation.md` §4).
**New tools before new concepts**: a high-value selection *and* steering signal is the **arrival of a new
tool/instrument/method** — reallocate toward the important problems it just made attackable
(`selecting.md` §2).

## §5 — Premortem before committing a program (Klein)

Before committing resources to a research direction, **imagine it is a year later and the project has
DEFINITIVELY FAILED, then write down why.** Prospective hindsight surfaces failure modes a forward "what
are the risks?" prompt misses (imagining a *certain* outcome generates markedly more, and more concrete,
causes), and it licenses dissent by making pessimism the assigned task. **Convert each cause into a
pre-committed kill condition + instrumentation** (what would I SEE if this is failing?). The premortem on a
single experiment is `acting-on-hypotheses`; running it on the **overall program/portfolio commitment** —
and using it to shape which bets enter the portfolio — is here.

## §6 — The forecast ledger (Tetlock), and the outside view

A program is a portfolio of bets, and **only scored forecasts expose miscalibration.** Attach **explicit
probabilities** to research outcomes and **keep score (Brier)** — you cannot HARK or hindsight-rationalize
a result you **pre-assigned a probability to** (this is the continuous, calibration-focused sibling of
pre-registration, `not-fooling-yourself.md` §1). Two operational moves (the rest of superforecasting is
disposition, which the LAW says does little for an agent — keep the mechanisms):
- **Fermi-ize** — decompose a big "will this work?" into estimable sub-questions, each with a probability.
- **Start from the OUTSIDE VIEW / base rate** — what fraction of comparable projects succeeded? — BEFORE
  the seductive inside-view plan, which is systematically optimistic (planning fallacy).

(Sizing a SINGLE forward bet is `acting-on-hypotheses`; maintaining the scored portfolio across bets is
steering, here.)

## §7 — Diagnose the binding constraint: debt vs. discovery (Olah & Carter)

Fields accumulate **research debt** (undigested ideas, bad abstractions, missing explanations) that raises
entry cost and stalls progress; **distillation** — making ideas clear, well-abstracted, usable — is a
first-class research act that unlocks a field's compound interest, not a consolation prize. **The steering
judgment**: diagnose when the binding constraint on a subfield is **DEBT (everyone is confused) rather than
missing RESULTS (genuine unknowns)** — when confusion dominates, the highest-leverage move is to build the
clean abstraction / reference implementation / clarifying explanation; when unknowns dominate, discover. An
agent that reads and synthesizes at scale is unusually well-placed to pay down debt. (EXECUTING the
synthesis is `systematizing-knowledge`; the ALLOCATION judgment to spend program effort on distillation
over discovery is here.)

## §8 — Engineer the environment: the open-door / exploration budget

Some research judgment is not about the problem but about **engineering the environment that keeps you
coupled to which problems matter.** Hamming's reported observation: researchers who work with their **door
open** are less productive day-to-day but do the **more important** work, because openness keeps them
tuned to the field's live problems — a real exploration/exploitation trade. **Mechanism for an agent**:
hold an explicit **open-door / exploration budget** — a standing fraction of effort spent sampling
adjacent literatures and forcing cross-field collisions, even at a cost to focused throughput — because
the important problem (and the tool that cracks it) usually arrives from an **adjacent** field, and a
fully exploitation-tuned agent will never see it. **Treat serendipity as a designable input, not luck.**
