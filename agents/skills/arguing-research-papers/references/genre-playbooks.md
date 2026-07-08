# Genre playbooks — the field-dependent fill (schema is universal, content is not)

> **Scope**: the SOLE home of the *venue-specific* instantiation. The argument schema (Toulmin) and
> the reconciliations are field-invariant; what counts as **backing**, what the review form **scores**,
> and which conventions are **mandatory** are field-dependent (`reconciliation.md` §4). Calibrate to
> the target venue's **reward function** and its **floor-reader**. Provenance: `sources.md`.
>
> **Durability contract.** Venue-specific facts (review-form fields, checklist items, rebuttal caps,
> policy) move year to year. They live ONLY under the dated snapshot heading in §1, are marked
> `[venue-fact — re-verify]`, and the body above never hardcodes a review-form number. **Re-verify the
> §1 snapshot against the current Call-for-Papers on every reforge** — never trust the prior harvest.

## §1 — CS / ML top venues (NeurIPS · ICML · ICLR · ACL/ARR · CVPR)

The governing fact: **high-volume, time-boxed, adversarial review**. A reviewer decides interest in
minutes across many papers and is looking for a reason to say no. Write the paper as an
**advertisement** whose Figure 1 conveys the whole idea to a reviewer who reads nothing else (Freeman),
and **spell out the point — never assume the reviewer will infer it.**

- **Contributions bullet list** at the end of the intro — reviewers extract claims under time
  pressure, so make them scannable; each bullet = one refutable claim + a forward pointer to its
  evidence (the list is your self-audit that every claim has an anchor). *Hierarchy, not parity*
  (`reconciliation.md` §3): one governing claim, the bullets ladder up.
- **Ablation as a controlled experiment** — to defend "the effect comes from *our* idea" against "the
  effect comes from scale/tuning": for each component, produce a variant identical in *every other
  respect* (data, compute, parameter count, tuning) with that component removed; tabulate the delta;
  attribute the effect only to components whose removal degrades it. Match parameter-count and compute
  against baselines. Ablation licenses "which internal component drives the *in-distribution* metric" —
  it does **not** license generalization; that needs multiple datasets/domains + variance.
- **Reproducibility is a gate, not a courtesy** — the artifact is code/data, so release is effectively
  mandatory; report exact hyperparameters and how chosen, number of runs, **error bars / across-seed
  variance**, and compute. A "state-of-the-art" claim on a single run with no variance is a soundness
  reject.
- **Novelty is scored** — where Originality is an explicit review dimension, **stake** the novelty, but
  bound it ("to our knowledge") so one counter-citation cannot collapse your credibility. State the
  *contribution type* (Black) so the reviewer applies the right yardstick and does not read simplicity
  as "incremental".
- **SOTA vs mechanism** — for an empirical-benchmark subfield with a canonical task, beating the
  leaderboard is the legible currency; for theory / AI4S / analysis papers, mechanism and generalizable
  understanding are the contribution and a pure leaderboard delta is discounted. Report both when
  bridging.
- **Rebuttal / author response** — a rigid short window; the move that shifts a borderline score is a
  **table of NEW results** answering the requested experiment, not rhetoric (separate *misunderstanding*
  → fix the text, from *disagreement* → rebut with data; concede real limits and state the fix).
  **Pre-compute the likely-requested ablations before submission** so you can paste them in. Prioritize
  the borderline/negative reviewer. Never de-anonymize.
- **Related work goes late** (SPJ regime) so it does not smother the idea; but the intro still carries
  the *nearest* prior work + the delta.

### Snapshot — venue facts (verified 2026-07; `[venue-fact — re-verify on reforge]`)

- **NeurIPS reviewer rubric** — sub-scores **Soundness / Presentation / Contribution** (each 1–4) +
  **Overall** (1–10) + **Confidence** (1–5); four criteria: **Originality, Quality, Clarity,
  Significance**. Skeptic mapping: unsupported claim → low Soundness; unclear method/Fig 1 → low
  Presentation; incremental delta → low Contribution; private/narrow metric → low Significance. Write so
  every scored box has an obvious "high" answer. `[venue-fact — re-verify]`
- **NeurIPS paper checklist** — per-item Yes/No/NA + justification: claims-match-scope, limitations,
  theory-assumptions+full-proofs, reproducibility disclosure, code/data, settings/hyperparameters,
  error bars, compute, ethics, broader impacts, safeguards, licenses. **Fill it honestly first — every
  forced "No" is what a reviewer will attack.** `[venue-fact — re-verify]`
- **ACL/ARR** — a discrete **Limitations** section is required and rewarded when specific (generic
  boilerplate fails); a Responsible-NLP checklist. `[venue-fact — re-verify]`
- **ICLR** review form has varied year to year (bare Rating+Confidence vs a NeurIPS-style split) —
  confirm the current year's form. `[venue-fact — re-verify]`
- Rebuttal caps (e.g. ICML ~5000 chars), dual-submission / supplementary rules, and any LLM-assistance
  disclosure policy are venue-and-year specific — check the CfP. `[venue-fact — re-verify]`

## §2 — Empirical science (experimental / observational)

- **The record zone is sacred** (`reconciliation.md` §1): Methods/Results are a complete, neutral,
  reproducible record; narrative lives only in intro/discussion. Agentless passive is acceptable in
  Methods (the apparatus is the "character"); restore active "we" in the argument zones.
- **Statistical honesty** (`calibration.md` §5): effect sizes **with** intervals, not binary
  significance; never "no effect" from a non-significant test; **label confirmatory vs exploratory** and
  never dress a post-hoc finding in a-priori language (HARKing); if many researcher degrees of freedom,
  pre-register or report the multiplicity.
- **Cost currency is practical** for applied work — the "so what?" must reach a tangible harm/benefit;
  overclaim has an asymmetric downside (a harmed reader), so the field's error cost pushes the
  bold-vs-calibrated dial toward caution (`reconciliation.md` §2).
- **The rejection red-team** — Bordage's empirical top reasons reviewers reject (run as a pre-submission
  checklist, `reviewer-defense.md`): inappropriate/incomplete **statistics**; **over-interpretation** of
  results; suboptimal instrumentation; sample too small/biased; text hard to follow; **insufficient
  problem statement**; inaccurate/inconsistent data; **incomplete/outdated literature review**;
  insufficient data presented; defective tables/figures.
- **Structured abstract** where the venue mandates it (`frameworks.md` §4); primary outcome first.

## §3 — Math & theory

The reader is a referee verifying a permanent record; the currency is a **proof**, and significance is
argued differently from empirical work.

- **Motivation → Statement → Proof** (Halmos), three *separated* blocks: motivation/definitions FIRST;
  the one-sentence theorem statement (all hypotheses, no housekeeping) NEXT; the proof (strategy
  announced, steps labelled) LAST. **State the theorem before proving it** — never behind a hanging
  derivation.
- **Significance-legibility** (the theory analogue of "so what") — a theorem reads as unmotivated
  folklore unless you supply: the **delta over prior work** (what is newly true), **corollaries** (what
  it buys), and **necessity / sharpness examples** (a counter-example showing a hypothesis cannot be
  dropped, or the bound is tight). The model's failure is omitting all three.
- **State-first, prove-in-DAG-order** (reconciling top-down vs bottom-up): state the main theorem early
  (intro and/or section head) so significance is legible — this early statement is a *signpost*, allowed
  to point forward (navigation ≠ comprehension); then develop lemmas in dependency order (backward-only
  DAG — the DAG discipline itself is `structuring-documents`) and re-state-and-prove the theorem at its
  logical position.
- **Intuition then rigor, separated not omitted** — lead with a clearly-flagged intuition pass (why it
  is true / how one would find it — not a softer restatement of the theorem), then the complete rigorous
  pass; the referee still gets full rigor, located and checkable. Keep intuition *quarantined* from the
  formal chain so it cannot smuggle in hand-waving.
- **Notation discipline** — one concept, one symbol, across the whole paper (keep a global alphabet);
  a symbol earns its place only if it (a) names a concept used many times or (b) is algebraically
  manipulated — not to transliterate a one-off English sentence or a logical connective in running prose
  ("the best notation is no notation" targets *decorative* symbolism, not the working calculus of a
  symbolic theory). Proof-gap tells to self-audit: "clearly", "it is easy to see", "by a similar
  argument" placed exactly at the hard step. Extract a shared **lemma** rather than duplicating a
  near-identical argument block. (Math-in-prose typography — don't start a sentence with a symbol,
  number displayed equations you cite — is Knuth-Larrabee-Roberts line-editing, largely `linting-prose`.)
- **"Say it twice" is legitimate here** (Halmos), distinct from the DRY rule: repeat the *framing*
  (informal then formal; a parallel structure to expose a delta) — never the maintained *source of
  truth* (a definition/number that can silently diverge → that is `structuring-documents`' single-source
  rule). Repeat the exposition, never the fact.

## §4 — Japanese review tradition (adds what the Anglo tradition underweights)

The Japanese pedagogy (戸田山・木下・野矢・酒井) supplies two disciplines the model most needs. Preserve
the terms; the rule is in English.

- **問い・主張・論証 の三点セット** (Todayama) — a paper = a definite answerable **問い** (question) →
  ONE clear **主張** (claim) → a **論証** (argument: 根拠/grounds + 導出/inference carrying them to the
  claim). All three present and linked; a missing element is a specific failure. The corrective to the
  model's **「〜について」exposition** ("This paper explores X") which has no arguable spine: pose a sharp
  問い with a definite answer, not a topic.
- **事実と意見の峻別** (Kinoshita) — every statement is either **事実** (a fact whose truth is in
  principle verifiable by others) or **意見** (the author's judgment/inference). The writer must know
  which each sentence is and *mark* it: 意見 gets a judgment-marker ("〜と考えられる", "we interpret"),
  事実 does not — and **never the reverse** (a 意見 written as a 事実 is the スリカエ a reviewer catches;
  it is the model's silent-overclaim failure). Map onto sections: **事実 in the record zone
  (Methods/Results), 意見 in the framing zones (intro/discussion)** — this is 木下's grounding of the
  zone-split. This per-sentence 事実/意見 pass is the single most effective corrective to model
  overclaiming.
- **主張を絞る** (Sakai) — commit to ONE governing 主張; list sub-contributions only as its components,
  never as co-equal theses (the corrective to model sprawl; = G1). If two claims cannot be subordinated
  to one, they are two papers.
- **新規性・有用性・信頼性** — three separable gates a Japanese reviewer weighs, rejection on any one:
  **新規性** (is the claim new *relative to specific named prior work*?), **有用性** (does it matter?),
  **信頼性** (is the evidence trustworthy/reproducible?). A pre-submission acceptance checklist; it names
  the same three axes as the NeurIPS Originality/Significance/Soundness split, cross-culturally.
- **逆茂木型を避けよ** (Kinoshita) — no sentence may require *later* material to be *understood*
  (comprehension is forward-only); *navigation* pointers ("§5 gives the proof") are fine. This is the
  reader-side of the backward-DAG (owned as document structure by `structuring-documents`); here it is
  the discipline that the *argument* never leans on an undefined term.
- **隠れた前提を明示せよ** (Noya) — surface a hidden premise *iff* a skeptic in the target audience could
  deny it or it crosses field boundaries; suppress genuinely-shared background (the same contestability
  gate as Toulmin's warrant, `frameworks.md` §1). A 反論 targets one of three joints — the 根拠 (deny
  the data), the 導出 (deny the inference), or the 主張 (deny the conclusion); red-team your own claim at
  all three (`reviewer-defense.md`).
