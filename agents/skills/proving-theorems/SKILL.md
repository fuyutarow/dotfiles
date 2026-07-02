---
name: proving-theorems
description: >-
  Runs mathematical proof as a human-governed loop where the proof assistant's kernel is the only
  trust anchor, AI drafts proofs and statements at scale, and the human owns FAITHFULNESS (does the
  formal statement mean the intended theorem). Use whenever the task involves formalizing a theorem,
  autoformalizing a natural-language statement, checking whether a formal statement is faithful,
  choosing or driving an AI theorem prover, running a blueprint-driven formalization, orchestrating
  parallel proof/gate agents against a locked-statement blueprint, or deciding whether to formalize
  at all vs. stay informal. Trigger on: Lean / Lean 4 / Mathlib, Rocq (Coq),
  Isabelle/HOL, Metamath, theorem proving / 定理証明, formal proof / 形式証明, formal verification,
  autoformalization / 自動形式化, faithfulness, statement drift / vacuous statement, blueprint
  formalization, hammer / Sledgehammer / premise selection, AlphaProof, DeepSeek-Prover,
  Goedel-Prover, miniF2F / PutnamBench, expert iteration / RL theorem proving, AI4S math. Assumes a
  strong math/CS reader; teaches durable method, not what a kernel is.
---

# proving-theorems — kernel-trusted, AI-drafted, human-owned faithfulness

> **Scope**: durable methodology for doing mathematics with proof assistants + AI provers as a
> top-tier / AI4S researcher. This file holds the precedence-setting CORE inline; everything
> fast-moving or deep lives in `references/` and loads on demand.
> **Audience**: strong math/CS background assumed. No explanation of what a kernel, Lean, a
> typeclass, or expert iteration *is* — only how to deploy them well.
> **Durability contract**: the body below contains NO model names, NO benchmark percentages, NO
> contest outcomes, NO library counts. Every such time-sensitive fact lives ONLY under the dated
> heading in `references/state-of-the-art.md`. If you find a hardcoded number in this file, it is a
> bug — fold it back into the reference.

## Thesis

Trust the kernel, draft with AI, **own faithfulness**: the kernel settles whether a proof discharges
its goal, so the entire residual risk — and your scarce attention — moves to the *statement*.

## Core mental model — trust relocates to the statement + library

Machine-checking does not eliminate trust; it **relocates** it. A passing kernel guarantees the proof
body discharges the stated goal. It does **not** guarantee the stated goal is the theorem you mean.
Therefore:

- **Residual risk lives in exactly two places**: (1) the *statement* — its definitions, hypotheses,
  quantifier order, edge cases; (2) the *kernel + library* you import. Never in the proof body.
- **Once a no-`sorry` proof typechecks against a faithful statement, the proof body is a commodity.**
  Who or what wrote it (you, an AI, a hammer) is irrelevant; re-reading it is wasted effort.
- **The guarantee is silent and upstream-fatal under an unfaithful statement.** A drifted, vacuous,
  or contradictory-hypothesis statement can typecheck AND be provable while encoding a *different*
  theorem. The kernel cannot catch this — it is, by construction, not the kernel's job.

This single asymmetry — *kernel owns proof-correctness, human owns statement-faithfulness* — drives
every decision below.

## Decision 1 — formalize, or stay informal?

**Decide this FIRST, before touching a proof assistant.** Formal certification has real cost; spend
it where a hidden error is expensive.

**Default: formalize the STATEMENT (and any load-bearing lemmas) for anything you would stake further
research on — even if the full proof stays informal.** Formalize the *full proof* when ANY of:

| Formalize (kernel-certify) | Stay informal (LLM / prose) |
|---|---|
| Result is **novel** | Exploration, conjecturing |
| **Load-bearing** for downstream work | Exposition, teaching |
| **Too long/intricate** for confident human refereeing | Low-stakes sanity checks |
| An **incentive/adversary to be wrong** exists | A human referee is the final authority anyway |

The boundary moves toward *formalize* as stakes, novelty, and proof length rise beyond what a human
referee can confidently check. Informal AI reasoning can be broad and rhetorically persuasive, but
yields **no transferable correctness guarantee** — use it to *draft and explore*, formal verification
to *certify anything load-bearing*. See `references/epistemics.md`.

## Decision 2 — toolchain default

**Default: Lean 4 + Mathlib.** Not because its logical foundation is superior, but because the data,
the AI provers, the blueprint tooling, and active tooling/community investment concentrate there —
the gravity that governs an AI4S bet. Kernel-architecture differences across the ecosystems are real
but second-order for *this* choice.

Four escape hatches — switch by **task**, not by foundation aesthetics:

- **Isabelle/HOL** — you need best-in-class push-button automation *today* and have no AI-prover
  requirement (mature hammer + large archive).
- **Rocq** (the assistant formerly named Coq) — software / PL verification, where its ecosystem and
  code extraction dominate.
- **Metamath / Metamath Zero** — a minimal, auditable trusted core is the *overriding* requirement.
- **Stay informal** — see Decision 1; sometimes the right "toolchain" is prose + a human referee.

Foundations, kernel sizes, and the per-ecosystem trade study live in `references/landscape.md`.

## The human–AI–kernel loop

Run proving as a division of labor matched to who is good at what:

1. **Human** writes/curates the **statement** and the **high-level blueprint** (the dependency graph
   of lemmas). This is the irreducibly human part — it is where faithfulness is decided.
2. **AI** drafts **proofs and tedious lemmas** — whole-proof or subgoal-decomposed generation, plus a
   **hammer** for routine steps. Cheap, parallel, disposable.
3. **Kernel** checks every step. Binary, trustworthy, final on proof-correctness.
4. **Human reviews only the STATEMENT and the proof's structural shape** — never re-checks a proof
   body the kernel already verified.

For large efforts use a **dependency-graph blueprint** (LaTeX with dependency tags) so gaps,
progress, and parallelizable lemmas are explicit and many contributors/agents work concurrently. This
blueprint-driven pattern is the established way to make research-level formalization tractable —
*because* it anchors work to a mature library neighborhood. Concrete workflow in
`references/workflow.md`.

**Ground every definition against the intended library object.** Search Mathlib (or your library)
*first*; never let the model invent a plausible-but-wrong definition. At research level, formalize
INTO a mature library neighborhood; if the needed definitions/typeclasses do not exist, **build or
port them first**. Formalizing into a *definition vacuum* is precisely where faithfulness collapses —
the wall is missing definitions and dependency chains, not theorem phrasing.

### Execution model — the blueprint is the fan-out map

When the harness offers workflows/subagents, parallelism follows the blueprint DAG: **proof drafting
fans out per node** whose dependencies are stated (the kernel validates every return), and **gate
layers fan out per statement across model families**. Decisions 1–2, blueprint authorship, statement
blessing, and the lock decision stay **solo/human** — a statement blessed by the agent that wrote it
is not gated. Trust boundary in one line: **kernel-checked returns are trusted regardless of author;
every other agent return is prose** — gate, grep, or fetch-primary before it enters. No harness →
same DAG, serial. Full stage map, agent contract, and scale calibration: `references/workflow.md` §6.

## The faithfulness gate

**The binding constraint of AI-assisted proof is faithfulness (NL → formal statement), not proof
search or syntactic fluency.** A statement can typecheck AND be provable yet mean something else.
No sound, scalable, automated faithfulness certificate exists — so run a **layered,
cheap-to-expensive gate** before trusting ANY autoformalized statement, and never accept on one signal:

| # | Check | Cost | What it catches | Trust alone? |
|---|---|---|---|---|
| 1 | **Typecheck** (compiler/kernel) | trivial | nothing about meaning | **No — near-worthless alone** |
| 2 | **Negation/disproof filter** (try to prove ¬statement) | low | vacuous / contradictory-hypothesis statements | No |
| 3 | **Semantic round-trip** (a *separate* model informalizes the formal statement; compare to source) | low | semantic drift | No |
| 4 | **Bidirectional provability** (prove A↔B vs. a reference via ATP/hammer) | high | non-equivalence to a blessed statement | No (see caveats) |
| 5 | **Human expert spot-check** on a sample | high | residual semantic errors | The backstop, not a substitute |

Caveats that bound this gate:

- **Typechecking is a near-worthless faithfulness signal.** Bare LLM-as-judge and string metrics
  (BLEU) are unreliable and gameable by the same model families they grade.
- **ATP equivalence (check 4) false-positives on vacuous statements** (anything implies a vacuously
  true target) **and false-negatives when the prover is too weak** (true equivalences it can't find).
  It is only as strong as the backing ATP.
- **Cheap structural metrics** (tree-edit-distance) rival ATP-based ones **only on competition-level**
  statements; at research level, only *grounding + bidirectional provability + human review* are
  credible.
- **Evaluation is circular**: the same model families filter data, judge faithfulness, and are
  evaluated, with no independent oracle and a high human-error baseline. Treat single-judge verdicts
  as untrusted. Full method, metrics, and their failure modes: `references/faithfulness.md`.

## Verification depth per artifact

Label every artifact by what it actually guarantees, and never silently upgrade:

| Artifact | What it is | Treat as |
|---|---|---|
| Informal LLM draft / chain-of-thought | unverifiable prose | **exploration only** — never cite as established |
| Lean proof, **no `sorry`**, **faithful statement** (gate passed) | kernel-certified | **certified** |
| Lean proof with `sorry` / admitted lemmas | a typed TODO list | **NOT a proof** — track every `sorry` as an open obligation |
| NL "gold-medal" / contest AI output | rhetorically rigorous, machine-**un**verifiable | not established without formalization |

A `sorry`-laden or admitted-lemma development is **not done**: each `sorry` is an unproved obligation.
A development is complete only when no load-bearing lemma is stubbed.

## Scaling the proof side (the flywheel)

When you need *more proofs*, the durable architecture behind every frontier prover is one recipe, not
any specific search algorithm: **pretrain/SFT a code-math model on proof-assistant data, then improve
via a verifier-in-the-loop flywheel** — sample many attempts, keep only kernel-verified ones,
retrain/iterate (expert iteration / RL on kernel-checked outcomes), with subgoal/lemma decomposition
and compiler-feedback self-correction.

- **Decompose** hard goals into subgoals; add compiler-feedback self-correction loops.
- **Reach for tree search / critic-value models only when** whole-proof and best-first generation
  *stall on proof depth* — they earn their keep for deeper proofs but are accelerants, not necessities.
- **The flywheel filters unprovable mis-formalized training statements automatically** (they yield no
  verified proof) **but NOT vacuously-true or drifted-but-provable ones** — those actively teach the
  wrong thing and are unmitigated by the kernel. This is why faithfulness tooling pays off twice: at
  deployment *and* in the training data. Architecture details: `references/landscape.md`.

## Anti-patterns

- **Green-checkmark-as-truth** — treating a typechecking/kernel-passing formalization as evidence the
  *intended* theorem is proved, when the statement may be drifted, vacuous, or
  contradictory-hypothesis (provable for the wrong reason).
- **Leaderboard-percentage-as-capability** — quoting a benchmark number without the sampling budget
  (pass@k), without noting the benchmark may be partly mistranslated/saturated, or conflating
  *proof-given-a-blessed-statement* with *end-to-end statement+proof* (the end-to-end number is far
  lower because faithfulness errors compound multiplicatively).
- **Formalizing into a definition vacuum** — autoformalizing research-level statements before the
  needed definitions/typeclasses exist and are correctly in scope.
- **Single-judge faithfulness** — accepting a statement on one LLM-as-judge or on typecheck alone.
- **Re-reviewing what the kernel proved while skipping the statement** — wasted effort on the body
  (pointless) plus no scrutiny on the only thing at risk.
- **Treating NL AI proofs as verified mathematics** — presenting end-to-end natural-language
  "gold-medal" outputs as established; they are prose no kernel ever saw.
- **Counting `sorry`-laden / admitted developments as done.**
- **Benchmark-chasing as a research goal** — optimizing a saturated benchmark instead of completing
  durable library/blueprint formalizations (the real capability signal).
- **Ecosystem bikeshedding on logical foundations** — choosing a prover by kernel aesthetics rather
  than by where the data, tooling, provers, and collaborators are for your task.

## Pointers

| Need | Read |
|---|---|
| Proof assistants & AI-prover landscape; kernels, foundations, the flywheel architecture | `references/landscape.md` |
| Concrete workflows: blueprint-driven & AI-assisted formalization, hammers, grounding, orchestration (stage map, agent contract, trust boundary — §6) | `references/workflow.md` |
| The faithfulness problem in depth: gate methods, metrics, their failure modes & circularity | `references/faithfulness.md` |
| Reading benchmarks/leaderboards adversarially (pass@k, contamination, end-to-end vs blessed-statement) | `references/benchmarks-and-trust.md` |
| Epistemics: formal vs informal proof, the coverage/certifiability split, open problems | `references/epistemics.md` |
| **What's true right now** (model names, contest outcomes, SOTA numbers, library counts) | `references/state-of-the-art.md` — **DATED, read the live sources it cites** |

> **Dated pointer.** "State of the art" — specific provers, benchmark scores, IMO outcomes, Mathlib
> counts, funding — lives **only** in `references/state-of-the-art.md`, under a dated heading, with
> instructions to read the live source (e.g. the auto-generated library stats page with its
> generation date). It is stale within weeks by design; do not lift its numbers into durable prose or
> answer from memory.

