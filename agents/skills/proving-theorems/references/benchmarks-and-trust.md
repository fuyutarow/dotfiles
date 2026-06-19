# Benchmarks, leaderboards & how to read them adversarially

> Scope: the **durable discipline for not being fooled by a pass-rate**. A leaderboard percentage
> is a *negotiated artifact* — it depends on which benchmark, which split, what sampling budget,
> and whether the statement was earned or gifted. This file gives you the three questions to
> interrogate any number with, explains why end-to-end pipelines score far below their parts, and
> tells you what to trust *instead*. Current model names, sizes, and percentages live ONLY in the
> dated section at the end and in `state-of-the-art.md` — they go stale within weeks; the
> *reading discipline* here does not.

> **Cross-refs.** Faithfulness machinery (the thing benchmarks mis-measure) → `faithfulness.md`.
> Why "completed formalization" beats "score" as evidence → `workflow.md` (blueprints) and
> `landscape.md`. The formal-vs-informal coverage/certifiability split that benchmarks blur →
> `epistemics.md`. Live numbers → `state-of-the-art.md`.

## Table of contents

- [The one-sentence stance](#the-one-sentence-stance)
- [Why benchmark % overstates capability](#why-benchmark--overstates-capability)
- [The three questions to ask any pass-rate](#the-three-questions-to-ask-any-pass-rate)
- [Why end-to-end pipelines score far below either component](#why-end-to-end-pipelines-score-far-below-either-component)
- [The durable capability signal: completed formalizations, not scores](#the-durable-capability-signal-completed-formalizations-not-scores)
- [Benchmark migration is a durable phenomenon — how to vet a successor](#benchmark-migration-is-a-durable-phenomenon--how-to-vet-a-successor)
- [Anti-patterns](#anti-patterns)
- [State of the art (DATED — as of mid-2026)](#state-of-the-art-dated--as-of-mid-2026)

## The one-sentence stance

A leaderboard percentage is **proof-of-search-budget given a blessed statement on a contaminated,
saturated benchmark** — not proof-of-capability. Treat any number you cannot decompose along the
three axes below as **corpus contamination of your own beliefs**, not as weak evidence. Your
capability evidence is a *completed, kernel-checked formalization* with a faithful statement, not a
row on a leaderboard.

## Why benchmark % overstates capability

Three independent inflation mechanisms stack, all pushing the headline number *up* relative to the
real-world task ("take a theorem I mean, formalize it faithfully, and prove it"):

| Mechanism | What it does to the number | Why it is invisible in the headline |
|---|---|---|
| **Saturation** | The dominant competition benchmark's top scores have climbed near the ceiling. Once a benchmark is near-saturated, the *remaining* gap is the only signal, and it is dominated by benchmark defects, not capability. | A headline near the ceiling reads as "almost solved"; it actually means "the benchmark can no longer discriminate top systems." |
| **Mistranslation / unprovable items** | The dominant benchmark is independently shown to contain items that are mistranslated from the source, vacuously true, or literally unprovable as stated. A model "fails" provable-but-mistranslated items and "passes" vacuous ones. | The denominator is treated as ground truth; the faithfulness of the benchmark *statements themselves* is almost never audited before the number is quoted. |
| **Sampling-budget inflation (pass@k)** | "Pass" usually means *at least one* of k sampled attempts kernel-checks. As k grows (k from 1 to thousands+), pass@k rises monotonically. A score at a huge k is a different quantity from pass@1. | The k is often buried, mismatched across compared systems, or omitted entirely — so two equal-looking scores can differ by orders of magnitude in compute. |

The deeper point: **the benchmark gives the model the statement for free.** The hard, unsolved part
of real proving — writing a faithful formal statement of an informal theorem (`faithfulness.md`) — is
done by the benchmark authors and never measured. So even a *perfect* benchmark score certifies
"can prove a pre-blessed goal," which is the commodity half of the work, not "can do mathematics."

## The three questions to ask any pass-rate

Before a number changes your beliefs, demand all three answers. A "no" to any one makes the number
**contaminated, not weak evidence** — do not average it in, quarantine it.

1. **Are the benchmark statements verified faithful?**
   Did anyone check that each benchmark item *means* what its informal source says — i.e., not
   mistranslated, not vacuously true, not contradictory-hypothesis? If the benchmark is known to
   contain unprovable/mistranslated items, the denominator is wrong in *both* directions (false
   fails on mistranslations, false passes on vacuous items). Typecheck-only "validation" of a
   benchmark is near-worthless here (see `faithfulness.md`).

2. **Is pass@k disclosed AND matched across the systems being compared?**
   What is k? Is it the same k for every system in the table? "System A vs System B" is
   meaningless if A is pass@8192 and B is pass@32. The honest unit is either pass@1 (or a fixed,
   small, disclosed k) or a *compute-matched* pass@k. Also watch for budget reported in wall-clock,
   TPU/GPU-days, or token count rather than k — the same trick in different clothing.

3. **Is it end-to-end (statement + proof), or proof-given-a-blessed-statement?**
   Almost every leaderboard measures the second. The first — autoformalize the informal problem
   *and* prove it — is the real task and scores far lower (next section). If the headline does not
   say which, assume blessed-statement and discount accordingly.

A number that survives all three (faithful audited statements, disclosed matched pass@1-ish, true
end-to-end) is rare and worth weighting. Almost no public leaderboard number qualifies.

## Why end-to-end pipelines score far below either component

Faithfulness errors and proof failures **compound multiplicatively**, so the pipeline's score is
roughly the *product* of its stages, not the min and never the max:

```
P(end-to-end success)  ≈  P(faithful formalization)  ×  P(proof | faithful statement)
```

If autoformalization is right 60% of the time and the prover clears 80% of *correctly-stated*
goals, the pipeline lands near 48% — and that is optimistic, because it assumes the two failures are
independent and that a *passing* proof of an *unfaithful* statement is scored as a failure (it
should be — a kernel-green proof of the wrong theorem is worse than no proof). In practice
end-to-end (autoformalize-then-prove) numbers sit far below either component's solo number; the
gap is the faithfulness tax made visible.

Worse, the failure is *silent and asymmetric*: a mis-formalized statement that happens to be
vacuously true gets a clean kernel check and counts as a **success** in a naive harness, inflating
the score while teaching you nothing. So a high end-to-end number can itself be a faithfulness
artifact. This is exactly why **the statement is the deliverable and the proof is commodity** — the
benchmark inverts that priority and measures the cheap half.

Practical reading rule: if a paper reports a high *proof-given-statement* number and a separate,
much lower *end-to-end* number, **the end-to-end number is the capability claim**; the high one is
the search engine's spec sheet.

## The durable capability signal: completed formalizations, not scores

Leaderboards measure *attempts at blessed competition statements*. The thing that actually moves
mathematics — and the thing that does not saturate, leak, or game — is a **completed, kernel-checked
formalization of something people care about**, with a faithful statement and no `sorry`:

- **A blueprint-driven project that reaches 100% of its dependency graph** (a landmark theorem
  reduced to library lemmas, all discharged) is hard, dated evidence of capability at *that depth*
  in *that area*. It cannot be inflated by sampling budget and cannot pass on a vacuous statement
  (a vacuous lemma would not discharge its downstream obligations). See `workflow.md`.
- **Merged library contributions** (new definitions/theorems accepted into the dominant library)
  prove the work survived adversarial human review *and* the kernel *and* fit a real dependency
  context — the trifecta a benchmark row never tests.
- **A drop in the count of `sorry`/admitted lemmas** in a real development is a truer progress
  metric than a leaderboard delta, because every `sorry` is a tracked open obligation, not a
  rounding error.

When someone cites a percentage, ask "what did it let you *finish*?" If the answer is "nothing, it's
a benchmark," weight accordingly. Demonstrated completed formalizations > leaderboard numbers, every
time, as your capability prior.

## Benchmark migration is a durable phenomenon — how to vet a successor

Benchmarks saturate; this is structural, not incidental. A benchmark is a fixed target, capability
is rising, and once the top systems cluster near the ceiling the benchmark stops discriminating and
the field migrates to a harder successor (competition → undergraduate → Putnam-style → research-level,
and onward). **Expect the named benchmark in any guidance to be obsolete soon** — which is why no
benchmark name or number appears in the durable prose above. The durable skill is vetting whatever
the successor is:

| Vetting axis | Pass criterion for a credible successor benchmark |
|---|---|
| **Statement faithfulness audited** | Items were checked for mistranslation / vacuity / contradiction, not just typechecked. Publishes its known-defect list. |
| **Contamination-resistant** | Statements postdate or are held out from training corpora (a saturated benchmark is often *also* leaked into training data — double inflation). Prefer freshly-authored or competition-fresh items. |
| **Reports pass@1 (or fixed matched k)** | Headline is a low/fixed-k number or compute-matched, not a best-of-thousands cherry-pick. |
| **End-to-end track exists** | Has a statement+proof track, not only proof-given-statement. |
| **Depth labeled** | Distinguishes competition/undergrad from research/graduate depth (faithfulness collapses at research depth — `faithfulness.md`), so scores are not averaged across incomparable difficulties. |
| **Live, dated stats** | Numbers come with a generation date and a live page, not a frozen screenshot. |

A successor that fails "faithfulness audited" or "contamination-resistant" is just the old trap with
a new name — do not migrate your trust to it merely because it is newer or harder-sounding.

## Anti-patterns

- **Citing a leaderboard % as capability.** Quoting "X% on \[benchmark]" without the pass@k, without
  noting saturation/mistranslation, or conflating proof-given-blessed-statement with end-to-end.
- **Averaging contaminated numbers.** Treating a number that fails one of the three questions as
  "weak evidence" and folding it into an aggregate — it poisons the aggregate; quarantine it.
- **Mismatched-k comparisons.** Ranking systems by scores taken at different sampling budgets.
- **Scoring a vacuous pass as a success.** Letting a kernel-green proof of a vacuously-true /
  mis-formalized statement count toward the rate (see `faithfulness.md` negation/disproof filter).
- **Benchmark-chasing as a research goal.** Optimizing a saturated benchmark instead of completing
  durable library/blueprint formalizations — the actual capability signal.
- **Hardcoding numbers into durable guidance.** Writing "the SOTA is N%" into evergreen prose;
  numbers belong only in a dated section with a source and date.
- **Migrating trust to a "harder" successor unvetted.** Assuming a newer benchmark is sound because
  it is harder; verify faithfulness-audit and contamination-resistance first.

---

## State of the art (DATED — as of mid-2026)

> Everything below goes stale fast. Read the **live leaderboard with its pass@k and date** before
> repeating any of it; never paste these into durable prose. See `state-of-the-art.md` for the
> rolling snapshot.

- **The dominant competition benchmark (miniF2F) is effectively saturated.** Top reported scores sit
  ~88–90%+ *at large sampling budgets*, and the benchmark is independently shown to contain
  mistranslated / unprovable items. Read its scores as "no longer discriminating," not "solved."
  - DeepSeek-Prover-V2-671B: **88.9% on miniF2F-test** in CoT mode **at pass@8192** (up from 82.4%
    at pass@32) — a textbook illustration of pass@k inflation; also **49/658 on PutnamBench**;
    introduced ProverBench (325 problems). (arXiv:2504.21801, 2025-04-30;
    github.com/deepseek-ai/DeepSeek-Prover-V2)
  - Goedel-Prover-V2: **32B at 88.0%** (88.1% ± 0.8% in the paper) / **90.4% with self-correction**,
    pass@32 on miniF2F; **8B at 84.6%** pass@32, outperforming the ~84× larger DeepSeek-Prover-V2-671B
    "under the same metric" — i.e., open-weight provers have caught/passed the larger closed model on
    this saturated benchmark. The 32B also leads PutnamBench among open-source (86 problems @
    pass@184 vs DeepSeek-Prover-V2-671B's 47 @ pass@1024). (arXiv:2508.03613, v1 2025-08-05;
    github.com/Goedel-LM/Goedel-Prover-V2)
- **The headline-vs-reality gap, concretely.** AlphaProof's Nature paper reports miniF2F-test scaling
  **96.3% (2 TPU-min) → 97.7% (12 TPU-hr) → 99.6% on the test split (with TTRL, ~500 TPU-days)** and a
  saturated **100% on the easier miniF2F-valid split** — but only **~27.9% → 39.4% → ~56.1% on
  PutnamBench-test** across the same budget ladder. The same system on a less-saturated benchmark
  drops ~40+ points: saturation is benchmark-specific, and the harder benchmark is the live signal.
  The budget ladder itself is the pass@k lesson in compute units. ("Olympiad-level formal
  mathematical reasoning with reinforcement learning," Nature vol 651 pp 607–613,
  DOI 10.1038/s41586-025-09833-y, published online 2025-11-12; Table 1.)
- **End-to-end compounds, visibly.** End-to-end autoformalize-then-prove pipelines on competition
  sets score far below the proof-given-statement headlines — reported in the mid-30s% range while
  proof-given-statement numbers on the same material sit in the high-80s–90s%+. The gap is the
  faithfulness tax (the multiplicative loss above), not a weaker prover.
- **The IMO caveat that anchors all of this:** the strongest formal result (AlphaProof +
  AlphaGeometry 2, **28/42 = silver at IMO 2024**, 4/6 problems) had its **problem statements
  hand-formalized into Lean by humans** — faithfulness was outsourced and *not* part of the score.
  AlphaProof solved P1, P2, P6 (P6 = the hardest, full marks from only 5 of 609 contestants);
  AlphaGeometry 2 solved P4 (geometry, in 19s); P3/P5 unsolved; gold threshold was 29. Training used
  **~80M auto-formalized statements** (expanded from ~1M informal problems) and **up to three days of
  compute per problem**. The durable lesson is the human-formalization caveat, not the score.
  (deepmind.google/blog/ai-solves-imo-problems-at-silver-medal-level/, 2024-07-25; Nature, 2025.)
- **Benchmark migration is already underway:** miniF2F (competition) is saturated, so the live signal
  has moved to PutnamBench (undergraduate/Putnam-level, far from saturated) and beyond toward
  research-level sets. Expect this list to be obsolete; vet the successor with the table above.
- **Library-growth as a non-saturating signal (read live):** the dominant library (Mathlib) keeps
  growing weekly — on the order of **~279k theorems, ~133k definitions, 772 contributors, ~2.37M
  lines across ~8,890 files** per the live `mathlib_stats.html` (generated 2026-06-19). Any frozen
  count is stale within weeks; always read the live auto-generated stats page *with its generation
  date*. This kind of completed, merged work — not a leaderboard row — is the capability signal that
  does not saturate.

