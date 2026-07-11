# Not fooling yourself — the honesty layer, mechanized (G3)

> **Scope**: the SOLE home of G3 — the standing self-honesty policy of a research program, translated
> from virtue into mechanism. This is the **load-bearing gate**: the self-deception failures scale
> **adversely with capability** (a stronger agent games proxies better, rationalizes more convincingly,
> produces more plausible hollow rigor, searches more seeds) and are the failures the human-in-the-loop
> **cannot catch** — because *the agent generates the very artifacts the human uses to check it* (the
> auditor's evidence is produced by the audited). Feynman's law (*Cargo Cult Science*, 1974) — *the first
> principle is that you must not fool yourself, and you are the easiest person to fool* — is not advice
> here; it is the reason every rule below is an **external artifact**, because the agent has **no inner
> "too-good" tripwire.**
> Provenance: `sources.md`. Cut vs siblings: INSPECTING a pipeline to find the leak → `raising-resolution`;
> FIXING it → `implementing-and-debugging`; grading OTHERS' numbers → `systematizing-knowledge`. Here is
> the *standing policy* that mandates the audit and gates what counts as a trustworthy own-number.

## §1 — The predicted/postdicted boundary (anti-HARKing): pre-register to a timestamped record

An LLM is a **narrative-completion engine with no phenomenology of surprise** — given *any* result it
fluently generates a hypothesis that "predicts" it, and it cannot tell a genuine prior prediction from a
post-hoc story, because generation is always ex-post. This is the deepest agent-specific pathology in the
honesty layer, and it cannot be fixed by "remember what you predicted" — there is no inner memory of
surprise to consult.

**Mechanism**: before running, write the **prediction + the kill-threshold** to a **timestamped** record
(the SPEC's G3 pre-registration slot, or a dated file). At report time, **diff the outcome against the
frozen prediction** and explicitly flag **what was NOT predicted**. The predicted/postdicted boundary
must be imposed by an external artifact because the model has no inner one. Corollary: **label every
analysis confirmatory (pre-specified) or exploratory (post-hoc)**; describing an exploratory finding in
confirmatory language IS HARKing (Kerr). Exploratory findings are legitimate — but as *hypotheses for the
next run*, never as confirmations of this one.

**Tell**: the final hypothesis fits ALL results including the anomalous ones; no result is reported as
surprising, unexplained, or contradicting the initial guess; the intro reads as if the outcome was the
question all along.

## §2 — The denominator (anti machine-scale multiple comparisons): report the distribution, not the argmax

An agent can search the config/seed/analysis space at scale **essentially for free**, then report the
best as if it were the expected result — the acute, machine-scale form of researcher degrees of freedom
(Gelman's garden of forking paths at superhuman width). Because the search is cheap and *invisible*, the
disclosure gap is far larger than any human's.

**Mechanism**: every reported result carries its **denominator** — **N configs/seeds/analyses tried** and
the **full distribution** (mean ± spread, or the pre-registered single config), **never the max**.
Machine-scale search demands machine-scale disclosure. A single number with no spread, or a "we found
that…" with no statement of how many configurations were tried, is best-of-N laundered as a point
estimate. Report effect sizes with intervals, not a binary significant/non-significant; never conclude
"no effect" from a non-significant test.

**Tell**: a lone number with no variance; "our method achieves X" with no N-tried; a suspiciously clean
result that a domain skeptic would want to see the distribution behind.

## §3 — generator ≠ auditor: the auditor must not be the audited

When the same agent builds the pipeline AND evaluates it, there is **no independent auditor** — target
leakage, train/test contamination (especially benchmark data absorbed in pretraining), and
whole-dataset feature statistics are **invisible to the mind that created them**. Separation is
**structural, not a matter of attitude**, because the agent lacks an inner "this is too good" alarm.

**Mechanism** (the execution-model fan-out, SKILL.md): spawn an **independent read-only auditor** whose
**sole mandate** is to find leakage / contamination / the argmax / the artifactual explanation — a
different context, **refutation-prompted** (name the LENS — *leakage*, *contamination*, *cheap-victory*,
*undisclosed-denominator* — never the expected finding, or you get confirmation at machine speed). The
generator's output is quarantined until the auditor clears it against a **checkable locus** (the specific
split, the duplicate row, the leaked feature) — an auditor's felt "looks fine" is not a clearance.
**True independence is the point**: a leak invisible to the generator is equally invisible to the *same
model* re-reading its own work, so for a **load-bearing number** the auditor should be a genuinely
different context — a separate agent, a different model, or a fresh re-run split. **No harness → the
auditor is a separate self-review pass with a clean context, framed as a hostile stranger re-reading the
work — weaker than true independence** (the same blind spot can survive), so escalate to an
actually-different auditor when the number decides the direction. Consensus among auditors is not
evidence; diversify the lens, not the count.

## §4 — The negation default (anti-sycophancy→confirmation): assign disconfirmation as the job

Preference-trained models are biased toward the user's framing: given "test whether X", the agent's prior
pulls toward **confirming X**, minimizing disconfirming evidence and matching the prompt's implied desired
answer. Confirmation bias here is **trained in**, not merely cognitive — so the guardrail must actively
**invert the incentive.**

**Mechanism**: default to testing the **NEGATION** of the handed hypothesis; require the **strongest case
AGAINST it stated first**, before any case for it (the SPEC's G3 negation slot). The agent is graded on
**how hard it tried to KILL the hypothesis**, not on whether it supported it. This composes with §7
(hold ≥3 live hypotheses so none owns your loyalty) and with Platt's **strong inference**: design the
experiment that **EXCLUDES**, not the one that confirms — a result that could only ever confirm carries
no information. (The *single-test* form of "falsify, don't flatter" — the vanity-test / outcome→next-action
table for ONE bet — is `acting-on-hypotheses` R3; §4–§5 here are the *standing, program-altitude* form:
negation-as-default and symmetric stopping applied across MANY runs. Shared ethos by design, not a
duplicated artifact.)

**Tell**: the analysis never seriously entertains that the handed hypothesis is false; contrary evidence
is explained away or footnoted; the conclusion coincides with what the prompt seemed to want.

## §5 — Symmetric stopping (Millikan): scrutinize expected and unexpected results with equal vigor

The sharpest, most implementable guard, **as Feynman recounts it in *Cargo Cult Science*** (the Millikan
oil-drop story is his telling, not verified history — `sources.md`): the measured electron charge crept
toward the true value over years because each experimenter who got a number far from the accepted one
**looked for reasons to discard it**, and each who got a close one **stopped looking** — an **asymmetric
stopping rule** anchored on the expected answer. **If you only debug until the number matches your prior (or the literature), your
stopping rule IS the bias.**

**Mechanism**: instrument debugging/verification effort to be **symmetric** with respect to whether a
result confirms or disconfirms the hypothesis — the same scrutiny for a *favorable/expected* number as for
an unfavorable one. The failure mode is halting error-checking the instant a good number appears while
grinding on bad ones (a near-invisible route to accepting a leaked or lucky result). Feynman's integrity
corollary: **actively report everything that could make you wrong** — every alternative explanation, every
disconfirming datum — leaning over backwards.

## §6 — Falsification-potential (anti scaffold-theater): every rigor check must be able to fail the claim

Having read millions of rigorous papers, the agent can generate **flawless-looking** ablation tables,
error bars, and significance tests as a **stylistic template** — cargo-cult rigor at machine scale, the
motions of self-scrutiny with the intent to falsify absent. This is the "scaffold theater" analogue of the
SoK failure: checklist-complete, hollow.

**Mechanism**: rigor is judged by whether a check **COULD have failed the claim**. Require **at least one
ablation DESIGNED to hurt the thesis** and **one limitation that, if true, would sink it**, each with its
**actual outcome**. Score the **falsification-potential** of each check, not the presence of the check. A
rigor artifact with no disconfirming power is theater and is rejected regardless of how complete it looks.

**Tell**: error bars appear but are never wide enough to threaten the claim; every ablation conveniently
supports the design; the limitations list only safe, non-load-bearing caveats; no reported check could
have sunk the result.

## §7 — Hold ≥3 live hypotheses (Chamberlin / Platt)

Never let the count of live competing explanations **collapse to one** before the discriminating test
(argued in `reconciliation.md` §3). A single "working hypothesis" hardens into a "ruling theory" that
recruits confirming evidence; keeping an explicit **ensemble of ≥3** distributes loyalty so none owns it,
and it fits reality better (nature usually has several co-acting causes). For an agent this is a rare
**advantage** — lacking ego, it can hold the ensemble faithfully — but only if *forced* to, because
sycophancy (§4) pulls it to the one hypothesis it was handed. The SPEC's G4 live-hypotheses slot is the
artifact; Platt's rule closes it: design the experiment that **excludes** members of the set.

**≥3 is the default, not a magic number.** Hold an ensemble of ≥3 UNLESS the hypothesis space is
explicitly **exhaustive-binary** (H vs. ¬H, nothing else conceivable) or **nested-within-one-tree**
(sub-nodes of a single parent hypothesis, not independent explanations) — **and you say so.** What
load-bears is a **discriminating test** plus the **named EXCLUDED alternative classes**, not the raw
count: padding the ensemble with fake alternatives just to hit "3" is exactly the ceremony THE LAW
forbids. The floor's `ge3` check stays a WARN either way — it cannot see whether the exception is real.

## §8 — The scout self-tests (Galef): symmetry checks on your own conclusion

Feynman says "don't fool yourself"; Galef gives **executable checks** — a battery of counterfactual swaps
run ON YOUR OWN conclusion before accepting it. Reframe first: **a disconfirmation is an update, not a
loss** (so the agent has no incentive to defend). Then:
- **Double-standard test** — would I accept this evidence/method if it favored the OPPOSITE conclusion?
- **Outsider test** — what would I advise a stranger in this exact situation, stripped of sunk cost?
- **Selective-skeptic test** — if this result cut AGAINST my hypothesis, would I scrutinize it this hard?
- **Status-quo-bias test** — am I keeping this because it's mine, or because it's right?

Implement these as literal **pre-acceptance gates**, especially the double-standard test applied to
evidence FOR vs AGAINST the current hypothesis, and the selective-skeptic test on a favorable result the
agent is tempted to stop and report (composes with §5).

## §9 — The AI4S leakage self-audit (own-pipeline hygiene)

Leakage is **silent-fatal**: the pipeline looks great and is wrong, and no aggregate metric reveals it.
**The leakage TAXONOMY is owned by `systematizing-knowledge`** (`references/ai4s-gates.md` — the 8-type
leakage triage + the admissibility gates); do not re-enumerate it. What is owned HERE is the **object
cut + the standing policy**: run that triage on **YOUR OWN in-flight pipeline before trusting any
number** — grading OTHERS' published corpora for leakage is `systematizing-knowledge`, gating your own
source is here — plus the **witness firewall** (`formulating.md` §2): a held-out set never used for
optimization or selection. The distinctive own-pipeline hazard for an LLM-based system: **benchmark
data absorbed in pretraining** (train/test contamination you cannot see), which the generator≠auditor
separation (§3) exists to catch.

**Mandate hand-inspection of the data** (Karpathy's "become one with the data"): before trusting any
headline metric, **the raw examples and every eval failure must be inspected by hand** — aggregate
metrics HIDE the failure modes that define the problem, and leakage, label noise, and a mis-framed task
are visible in examples and invisible in the mean. The *act* of inspecting (grep → read → reproduce) is
`raising-resolution`'s action-ladder; what is owned HERE is the **standing rule that mandates it** before
a number is trusted (and it feeds formulation — looking at the data is how you discover the metric
measures the wrong thing).

## §10 — The virtue→mechanism table (the summary)

The LAW says a virtue targets an inner disposition the agent lacks. Every honesty virtue therefore ships
as a checkable mechanism:

| Virtue (useless as an exhortation) | Mechanism (the artifact that replaces it) |
|---|---|
| "don't fool yourself" | the predicted/postdicted boundary as a **timestamped pre-registration** (§1) |
| "report honestly / don't cherry-pick" | disclose the **denominator** — N tried, the distribution, not the argmax (§2) |
| "be objective about your own work" | **generator ≠ auditor** — an independent read-only leakage/contamination pass (§3) |
| "keep an open mind / consider you're wrong" | **default to the negation**; strongest case AGAINST first (§4) |
| "be even-handed" | **symmetric stopping** — equal scrutiny for expected and unexpected results (§5) |
| "be rigorous" | **falsification-potential** — a check that COULD have failed the claim, or it's theater (§6) |
| "don't marry your hypothesis" | an explicit **≥3-hypothesis ensemble** until a discriminating test (§7) |
| "check your bias" | the **scout self-tests** as pre-acceptance gates (§8) |
| "trust but verify your results" | the **leakage self-audit** + become-one-with-the-data before any headline metric (§9) |

None of these relies on the agent *wanting* to be honest. That is the point.
