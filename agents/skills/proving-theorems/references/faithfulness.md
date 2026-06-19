# The faithfulness problem & verification discipline

> Invoke this gate before trusting **any** autoformalized statement (yours, AI-drafted, or
> benchmark-sourced).

> Scope: the binding constraint of AI-assisted proof. The kernel settles proof-correctness; what it
> cannot touch is whether the formal *statement* encodes the theorem you mean. This file gives the
> failure taxonomy, the cheap→expensive check hierarchy with each method's false-positive /
> false-negative regime, the statement-vs-proof autoformalization split, and why faithfulness is also
> a *training-data* risk. It does NOT re-teach the ecosystem choice (`landscape.md`), the
> blueprint/flywheel workflow (`workflow.md`), or benchmark adversarial reading
> (`benchmarks-and-trust.md`) — it supplies the *gate* those steps invoke before trusting any
> autoformalized statement.

## Table of contents

1. [Why faithfulness binds: typecheck + provable can still be the wrong theorem](#1-why-faithfulness-binds)
2. [Failure taxonomy](#2-failure-taxonomy)
3. [The check hierarchy (cheap → expensive)](#3-the-check-hierarchy-cheap--expensive)
4. [Each method's regime: where it false-positives / false-negatives](#4-each-methods-regime)
5. [Statement vs proof autoformalization](#5-statement-vs-proof-autoformalization)
6. [Faithfulness as a training-data risk (the flywheel does not save you)](#6-faithfulness-as-a-training-data-risk)
7. [The gate, as a checklist](#7-the-gate-as-a-checklist)

---

## 1. Why faithfulness binds

The single most expensive misconception in formal math is that a green checkmark means "true."
Machine-checking **relocates** trust; it does not eliminate it.

- A passing kernel guarantees exactly one thing: **the proof term discharges the stated goal**. It
  says nothing about whether the stated goal is the theorem you intended. Two artifacts carry the
  residual risk, and the proof body is neither of them: (a) the **statement** — the definitions,
  hypotheses, quantifier order, and edge cases you wrote down; (b) the **kernel + library** you
  chose to trust (Lean/Rocq/Isabelle/Metamath are all de Bruijn or LCF with small trusted cores, so
  this leg is rarely where you lose — see `landscape.md`).
- Therefore the epistemic burden has *moved*, not shrunk. The old question "is the proof correct?"
  is answered by the kernel for free. The whole question is now **"does this formal statement
  faithfully encode the theorem I mean?"** — and the kernel cannot see this, by construction: an
  unfaithful statement that happens to be provable produces a *silent* green checkmark.

**This is the binding constraint of the entire stack** — not proof search, not syntactic fluency. A
formal statement can typecheck **and** be provable yet encode a *different* theorem. The dominant
failure mode of AI-assisted proof is not "the prover couldn't find a proof"; it is "the prover found
a perfectly valid proof of the wrong statement." Even the strongest results respect this: the
silver-medal IMO 2024 run did not autoformalize the contest problems — humans **hand-translated** the
problem statements into Lean, outsourcing faithfulness to people precisely because no system can
certify it (see DATED section in `state-of-the-art.md`; Google DeepMind, *AI solves IMO problems at
silver-medal level*, 2024; Hubert, Mehta, Sartran et al., *Olympiad-level formal mathematical
reasoning with reinforcement learning*, **Nature**, 12 Nov 2025, DOI 10.1038/s41586-025-09833-y).

**When the guarantee is void entirely.** The kernel guarantee holds only for *proof-given-statement*
and only when the artifact of record is a complete kernel-checked proof. It evaporates if you treat
as your deliverable: an AI-produced **natural-language** proof (nothing was kernel-checked — see
§5 and `epistemics.md`), or a Lean development containing **`sorry`** / admitted lemmas (a typed TODO
list, not a proof — each `sorry` is an open obligation). In those cases proof-correctness risk
returns in full *on top of* the faithfulness risk.

---

## 2. Failure taxonomy

Each of these produces a statement that **typechecks and is provable** while meaning something other
than the intended theorem. The kernel catches none of them.

| Failure | Mechanism | Why the kernel misses it | Canonical tell |
|---|---|---|---|
| **Semantic drift** | The formal statement quantifies/structures the claim differently than the source (∀/∃ swapped, scope wrong, a "for all" silently restricted to a subtype). | The drifted statement is internally well-typed and may be perfectly provable — just *not the theorem*. | Re-reading the formal statement aloud yields a sentence that is *not* the source sentence. |
| **Vacuous truth** | A hypothesis is unsatisfiable or a quantifier ranges over an empty set, so the goal holds for no real content (`∀ x ∈ ∅, P x`; `h : 1 = 0 ⊢ anything`). | "Vacuously true" *is* true; the proof is valid. | The statement is provable *and so is its negation-of-the-conclusion* under the same hypotheses; or it proves with `simp`/`omega` suspiciously fast. |
| **Contradictory hypotheses** | The premises jointly imply `False`, making **every** conclusion derivable. | `False → anything` is a theorem. | You can also prove an obviously-wrong conclusion from the same hypotheses. |
| **Definition drift** | The model binds a name to a *plausible-but-wrong* object — invents a definition, or picks a Mathlib lemma whose name matches but whose meaning differs (e.g. `IsOpen` vs a hand-rolled "open", convergence in the wrong topology, a typeclass instance that silently changes the structure). | The wrong definition is a legitimate definition; everything downstream typechecks against it. | The statement does not `rw`/`unfold` to the library object you expected; the definition has no provenance to a known source. |
| **Paraphrase / counterfactual brittleness** | Two semantically equivalent NL phrasings yield *divergent* formalizations; a small counterfactual edit to the NL (flip a bound, negate a clause) is not faithfully reflected in the formal output. | Both formalizations typecheck; the discrepancy is invisible without comparing against the *other* phrasing. | Round-tripping a paraphrase of the source produces a different formal statement. |

These are not exotic. **Vacuity, contradictory hypotheses, and definition drift are the default ways
an LLM "succeeds" at the wrong task**, and they are exactly the cases a provability check *rewards*
(the statement proves, so a naive pipeline marks it done).

---

## 3. The check hierarchy (cheap → expensive)

Run these as **layered gates**, not alternatives. Each layer catches a failure class the cheaper
layers cannot, and the cheap layers are necessary precisely because they are cheap — but **none is
sufficient alone**, and the two cheapest (typecheck, single LLM-judge) are individually near-useless
as faithfulness signals.

| # | Check | What it catches | What it cannot catch | Cost |
|---|---|---|---|---|
| 0 | **Compiler typecheck** | syntax errors, ill-typed terms, unbound names | *every* semantic failure in §2 — a wrong-but-well-typed statement passes | trivial |
| 1 | **Negation / disproof filter** — try to prove the *negation*, or prove an obviously-false conclusion from the same hypotheses | vacuous truth, contradictory hypotheses (if *both* a statement and its negation prove, the hypotheses are inconsistent) | semantic/definition drift (a drifted statement can be perfectly consistent) | cheap (one extra prover call) |
| 2 | **Semantic round-trip** — informalize the *formal* statement with a **separate** model and compare the back-translation to the source NL | semantic drift, quantifier-scope errors, paraphrase brittleness | vacuity (the back-translation of a vacuous statement reads fine); judge collusion if the same model family informalizes and judges | moderate (1 generation + 1 comparison) |
| 3 | **Bidirectional provability** — when a reference statement exists, prove `A ↔ B` via an ATP / hammer | true equivalence to a blessed reference | vacuity (both vacuous statements are inter-provable); fails when no reference exists | moderate–high (ATP search) |
| 4 | **Human expert spot-check** on a sample | everything above, plus *intent* mismatches no automated check encodes | does not scale; humans themselves err at non-trivial rates | expensive |

Rules of engagement:

- **Typecheck is a near-worthless faithfulness signal.** It is necessary (a statement that does not
  compile is not a statement) and completely insufficient. Never accept a statement on typecheck
  alone.
- **Never accept a statement on a single LLM-as-judge alone.** Human experts produce semantic
  formalization errors at a high rate, and LLM judges are *gamed by the same models they grade*
  (evaluation circularity — see `benchmarks-and-trust.md`). Use the judge only as the comparator
  inside the round-trip (layer 2), backstopped by layers 1, 3, 4.
- **String / n-gram metrics (BLEU, exact match) are unreliable** and must not stand in for semantic
  checks — they reward surface form, the one thing paraphrase brittleness exploits.
- **The negation filter is the highest-value-per-dollar layer** because it directly targets the two
  failure classes (vacuity, contradiction) that a provability-only pipeline actively *rewards*. Run
  it before you celebrate any "it proves!" result.

---

## 4. Each method's regime

Knowing *when* each check lies is the actual skill. Faithfulness has no oracle; you are composing
imperfect filters whose error regimes are known.

### ATP-based equivalence (layer 3): both error directions are live

- **False positives on vacuity.** Two vacuously-true statements are inter-provable (`A ↔ B` holds
  because both are `True`). So `A ↔ reference` *passing* does **not** establish faithfulness if
  either side might be vacuous — you must clear layer 1 first. This is the single most dangerous
  silent failure of an equivalence pipeline.
- **False negatives when the prover is too weak.** A *true* equivalence the backing ATP cannot find
  reads as "not equivalent," wrongly rejecting a faithful statement. Equivalence checks are only as
  strong as the prover behind them; a `↔` that fails to prove is evidence about the prover, not
  necessarily about the statements.

### Structural metrics (tree-edit-distance over the parsed statement)

- **Rival ATP-quality only at competition level.** Cheap structural distance over canonicalized
  parse trees approaches ATP-based equivalence in agreement *only on competition-/undergraduate-level
  statements*, where the space of correct formalizations is narrow. At **research level** they are
  not credible — too many genuinely-equivalent statements are structurally far apart, and too many
  near-identical trees differ in a load-bearing typeclass.

### Semantic round-trip (layer 2)

- **Strong on drift and quantifier scope, blind to vacuity.** Back-translating a vacuous or
  contradictory-hypothesis statement yields prose that reads exactly like the source — the round-trip
  is satisfied while the statement is empty. Round-trip MUST be paired with the negation filter.
- **Collusion risk.** If the informalizer and the comparator share a model family, they share blind
  spots; use *different* models for generate-vs-judge, or treat agreement as weak evidence.

### Why a single judge fails (any layer used alone)

There is **no independent ground-truth oracle** for "this formal statement means this NL statement."
Every fully-automated check reduces either to trusting an LLM (gameable, collusive) or to trusting a
prover (vacuity false-positive, weakness false-negative). The defensible posture is **defense in
depth**: layer 1 (kills vacuity/contradiction) + layer 2 (kills drift) + layer 3 where a reference
exists (confirms equivalence) + layer 4 on a sample (catches intent). The durable methodological
core is that **autoformalization faithfulness is uncertified**: no automated check composes into a
sound, scalable certificate, so the residual is *owned by the human* — not certified away. Treat that
ownership as permanent regardless of future tooling; whatever new checks arrive, slot them into the
defense-in-depth stack rather than retiring the human-owned residual.

---

## 5. Statement vs proof autoformalization

These are different problems at very different maturity. Conflating them is a common error.

| | **Statement** autoformalization (NL theorem → formal statement) | **Full-proof** autoformalization (NL proof → formal proof) |
|---|---|---|
| Maturity | Strong at competition/undergraduate level; **collapses to single digits at research/graduate level** | **Much harder; reliable only on short proofs** |
| Bottleneck | Missing **definitions**, typeclasses, deep dependency chains — *not* theorem phrasing | Preserving the **dependency DAG** of a long multi-step argument |
| What actually helps | **Retrieval/grounding** against the intended library object — not proof power | Long-horizon harnesses, subgoal decomposition — early and hand-built |

**The research-level collapse is a definition problem, not a phrasing problem.** Competition-level
statements autoformalize well because their objects already live in the library. Research-level
statements collapse because the needed **definitions do not exist or are not in scope** — and the
model, asked to formalize into a vacuum, *invents* a plausible-but-wrong definition (definition
drift, §2). The lever is therefore **grounding**: search the library first; never let the model coin
a definition that should be a retrieval. Concretely, this collapse **reverses inside a mature library
neighborhood** — formalize into an area where the objects already exist and research-level work
becomes tractable. This is exactly why blueprint-driven projects anchored to a developed library
succeed (`workflow.md`), and why "formalize into a definition vacuum" is a top anti-pattern.

**Full-proof autoformalization is the harder problem.** Keeping a long argument's
logical-dependency structure faithful across many steps does not reduce to the statement-grounding
lever above. The durable consequence — independent of how good full-proof systems get — is the
**workflow** you adopt: do **not** autoformalize a paper's proof wholesale. Autoformalize the
**statement** (and any load-bearing lemmas) — own its faithfulness with the §3 gate — then let the
prover *re-derive* the proof under kernel supervision, rather than translating the human proof
step-for-step. This split is the right default whatever the state of the art, because it puts the
human-owned faithfulness burden on the small surface (the statement) and hands the large surface
(the proof) to the one component — the kernel — that *can* certify it.

---

## 6. Faithfulness as a training-data risk

Autoformalization is simultaneously the central deployment risk **and** the data engine of the whole
stack. Modern provers bootstrap by auto-formalizing large NL corpora into formal statements to train
on — at frontier scale, on the order of **tens of millions of statements** (illustrative dated
datapoint: ~80M in the AlphaProof pipeline as of 2024–25; see `state-of-the-art.md`). So faithfulness
defects do not stay at deployment — they **propagate from training data into prover behavior**.

The partial mitigation, and its sharp limit:

- **What the flywheel filters out.** Verifier-in-the-loop training (expert iteration / RL on
  kernel-checked outcomes — see `workflow.md`) keeps only proofs that the kernel verifies. A
  *mis-formalized training statement that happens to be unprovable* is automatically discarded — it
  never produces a kept proof. So one class of bad training data self-cleans.
- **What it does NOT filter — the real exposure.** The flywheel filters **unprovable**, not
  **drifted-but-provable**. A training statement that is **vacuously true**, has **contradictory
  hypotheses**, or has **drifted to a different (but provable) theorem** sails through: it yields a
  valid kernel-checked proof, gets *kept*, and **actively teaches the model the wrong thing**. The
  kernel cannot distinguish "proved the intended theorem" from "proved a vacuous/drifted one." This
  propagation is real and **unmitigated by the verifier**.

The payoff is that **investing in faithfulness tooling pays off twice**: at deployment (trustworthy
statements) and at training (a cleaner flywheel that is not silently learning from vacuous/drifted
statements). It is the rare lever that improves both the artifact and the engine that makes the
artifact. (Grade: moderate — the unprovable-statement self-cleaning is real and partly absorbs the
concern; the drifted-but-provable channel is the unmitigated residual.)

---

## 7. The gate, as a checklist

Before trusting **any** autoformalized statement (whether you wrote it, an AI drafted it, or it came
off a benchmark), run the layered gate. Treat the **statement as the deliverable**; the proof is a
commodity the kernel will validate for free.

1. **Typecheck** (necessary, near-worthless alone) — does it compile?
2. **Negation / disproof filter** — try to prove the negation *and* try to prove an obviously-false
   conclusion from the same hypotheses. If either proves, you have vacuity or contradictory
   hypotheses. **Run this before believing any "it proves."**
3. **Semantic round-trip** — informalize the formal statement with a *separate* model; compare to the
   source. Mismatch ⇒ drift. (Catches drift; blind to vacuity — hence step 2 first.)
4. **Bidirectional provability** — if a reference statement exists, prove `A ↔ reference` via
   ATP/hammer. (Only after step 2: vacuous statements falsely pass equivalence.)
5. **Human spot-check** on a sample — the only check that sees *intent*.

Hard rules:

- Never accept a statement on **typecheck alone**.
- Never accept a statement on a **single LLM judge alone**.
- A green kernel checkmark certifies the **proof-given-statement**, never the statement. Scrutinize
  the statement; do **not** re-review the proof body the kernel already verified.
- Count a development as done only when it has **no `sorry`** and a statement that has cleared this
  gate. Every `sorry` is an open obligation; track it as such.

> Cross-refs: ecosystem/kernel choice → `landscape.md`; blueprint + verifier-in-the-loop flywheel →
> `workflow.md`; reading pass-rates adversarially (end-to-end vs proof-given-blessed-statement) →
> `benchmarks-and-trust.md`; when to formalize at all vs stay informal → `epistemics.md`; dated SOTA
> (IMO 2024/2025, current benchmark saturation, hammer/library status, frontier training-set sizes) →
> `state-of-the-art.md`.

