# Concrete workflows: blueprint-driven & AI-assisted formalization

The actionable how-to layer behind `SKILL.md`. The other references cover the *why* and the
*what*: `landscape.md` (ecosystems, prover families), `faithfulness.md` (the statement-trust
problem in depth), `benchmarks-and-trust.md` (reading leaderboards adversarially),
`epistemics.md` (formal vs informal proof), `state-of-the-art.md` (the dated snapshot — every
fast-moving number, model name, and competition outcome lives there, tagged with its month).
This file is the loop you actually run: how to ground a statement, lay out a blueprint, drive
the per-artifact human-AI-kernel cycle, scale it with a verifier flywheel, track `sorry`s to
closure, and parallelize humans + agents against one shared plan.

The single organizing idea, repeated because it is load-bearing: **the kernel settles
proof-correctness, so you spend your attention on the statement.** Every step below is
arranged to push human effort toward statement faithfulness and high-level structure, and
to let machines absorb the proof body.

## Table of contents
1. Statement-first: ground definitions against the library before you write the statement
2. The blueprint method: LaTeX + dependency tags → graph → parallelizable lemmas
3. The per-artifact loop: draft → hammer → kernel → human reviews statement+structure only
4. Scaling with the flywheel: sample-keep-verified-retrain; when to add search/critic
5. `sorry`/`admitted` as a typed TODO list: tracking open obligations to closure
6. Collaboration: many humans + agents against one blueprint; review discipline
7. Anti-patterns (quick reference)

---

## 1. Statement-first: ground definitions against the library before you write the statement

Order of operations matters. **Write the formal statement before the proof, and ground every
definition in that statement against the intended library object before you write the
statement.** The dominant failure mode of AI-assisted proof is not a wrong proof — the kernel
catches those — it is a *right proof of the wrong statement*: a statement that typechecks and
is provable yet encodes a different theorem (semantic drift, a vacuously-true hypothesis set,
contradictory hypotheses that make anything provable). Typechecking is a near-worthless signal
that you got the meaning right; treat it as necessary and almost nothing more.

The reason the wall is in the statement, not the proof, is concrete: at research/graduate
depth, autoformalization fails not because theorem *phrasing* is hard but because the
**definitions, typeclasses, and deep dependency chains are missing or out of scope.** The job
is retrieval and binding, not proof power.

**Grounding procedure (do this for every non-trivial symbol in the statement):**
1. **Search the library first.** Before letting any model emit a definition, search Mathlib
   (or the AFP, or the Rocq (formerly Coq) stdlib, per `landscape.md`) for the object you mean.
   Use the live search/`exact?`/`apply?`/`loogle`-style tooling and the docs. A model will
   happily invent a plausible-but-wrong definition; that invented definition is exactly the
   semantic-drift bug.
2. **Bind to the intended object, not a lookalike.** Confirm the typeclass instances and the
   exact spelling of the predicate (e.g. `IsOpen` vs an ad-hoc `Open`, `Finset` vs `Set` with
   a finiteness hypothesis, `<` on the right order). Lookalikes typecheck and lie.
3. **Formalize INTO a mature library neighborhood.** Research-level formalization is tractable
   precisely where the needed definitions already exist and are in scope — that is why
   blueprint projects anchored to a mature library succeed. If the definitions do **not**
   exist, build or port them *first*. Formalizing into a definition vacuum is where
   faithfulness collapses; do not autoformalize on top of nothing.
4. **Only now write the statement**, and run it through the faithfulness gate (§3, and
   `faithfulness.md` for the full treatment).

Boundary condition to remember: autoformalization is tractable inside a mature library
neighborhood and degrades sharply outside it — *and recovers* once an immature area is built
up into a mature one. So "is the neighborhood mature?" is the question that decides whether the
statement-first step is easy or is itself a porting project. (For where today's tooling sits on
that curve by level — competition, undergraduate, research — see `state-of-the-art.md`.)

---

## 2. The blueprint method: LaTeX + dependency tags → graph → parallelizable lemmas

For anything larger than a handful of lemmas — and for *any* collaborative effort — use a
**blueprint**: a human-written LaTeX document of the whole argument in which every definition
and lemma carries dependency tags, compiled into a **dependency graph** that makes progress,
gaps, and parallelizable work explicit. The blueprint converts one monolithic proof into a DAG
of independent obligations that many contributors and agents can attack at once; this
decomposition is what makes a large formalization a parallel, schedulable project instead of a
serial slog. (For named projects and the timelines they hit, see `state-of-the-art.md`.)

**What a blueprint buys you:**
- **Visible progress and visible gaps.** Each node is colored by state (stated / proved in
  Lean / still `sorry`). You can see the frontier at a glance instead of grepping a codebase.
- **Parallelism.** Any node whose dependencies are *stated* (not necessarily proved) can be
  worked on independently — you may prove a lemma against the *statements* of its
  prerequisites before those prerequisites are themselves proved. This is what lets a crowd
  (human or agent) converge.
- **A faithfulness anchor.** The blueprint is the human-owned, human-readable theory of the
  argument; the Lean is checked against it. The high-level structure lives in prose where a
  mathematician can review it; the tedium lives in Lean where the kernel checks it.

**The recipe:**
1. Write the mathematical argument in LaTeX, decomposed into definitions and lemmas, each with
   an explicit name/tag and explicit `\uses{...}` dependency annotations (statement-uses and
   proof-uses are distinct — track both; a lemma can be *statable* once its statement-deps are
   stated, but only *provable* once its proof-deps are proved).
2. Generate the dependency graph from those tags (the standard `leanblueprint`-style toolchain
   does this and links each node to its Lean declaration).
3. Mirror every blueprint node as a Lean declaration whose statement is grounded per §1.
   Initially every proof is `sorry`. The graph is now a live TODO map.
4. Drive each node through the per-artifact loop (§3). The graph turns green as `sorry`s close.

Use the blueprint as the **source of truth for what is done.** A node is "done" only when its
Lean proof has no `sorry` *and* its statement passed the faithfulness gate — not when the
LaTeX reads convincingly.

---

## 3. The per-artifact loop: draft → hammer → kernel → human reviews statement+structure only

This is the inner cycle you run per lemma/definition. It is deliberately asymmetric: machines
generate and check the proof body; the human's scarce attention goes to the statement and the
structural shape, and the human **never re-checks a proof body the kernel already verified.**

**The loop:**

1. **Human: write/curate the statement and the local structure.** From the blueprint node,
   write (or accept) the grounded formal statement (§1) and decide the high-level proof
   skeleton if the step is non-trivial (which intermediate `have`s / sub-lemmas to introduce).
2. **AI: draft the proof.** Two complementary modes — pick by step difficulty:
   - *Whole-proof generation* — ask the model for the entire tactic proof in one shot. Cheap,
     fast, the default for routine and medium steps.
   - *Subgoal / lemma decomposition* — split the goal into sub-`have`s (often guided by the
     blueprint), prove each, recompose. Use when whole-proof generation stalls; it is also how
     you keep long arguments tractable.
3. **Hammer: discharge the routine layer.** Run a hammer (premise-selection → external ATP →
   in-kernel proof replay) on tedious/closing goals. Hammers automate the
   tedious-step layer so humans and AI spend effort on faithfulness and structure, not on
   plumbing. They are strong on routine goals **with available premises** and weak exactly
   where genuine mathematical insight or a missing premise is required — there, fall back to
   the neural prover or the human. (Reported hammer proof-rates are setting-sensitive:
   cumulative-premise context flatters them vs single-shot; don't over-read a headline rate —
   `benchmarks-and-trust.md`.)
4. **Kernel: check every step.** Compile. The kernel is the *only* thing you trust for
   proof-correctness; a green check guarantees the proof discharges the *stated* goal — nothing
   about whether that goal is the intended theorem. Compiler errors feed straight back into the
   self-correction loop (step 2) — the model re-drafts against the error message.
5. **Human: review the STATEMENT and the structural shape — only.** Confirm the statement is
   still faithful (re-run the gate if the statement changed), and that the proof's *shape* is
   the argument you intended (no accidental strengthening of hypotheses, no degenerate path).
   Do **not** re-read the tactic body line by line — the kernel already did that, and re-doing
   it is wasted effort spent on the one thing not at risk.

**The faithfulness gate (run before trusting any autoformalized statement; full detail in
`faithfulness.md`).** Layer cheap → expensive and never accept a statement on any single
signal:
1. **Typecheck** (necessary; near-worthless alone).
2. **Negation / disproof filter** — try to prove the *negation*. Catches vacuous and
   contradictory-hypothesis statements (if you can prove both the statement and its negation,
   your hypotheses are inconsistent and the statement is provable for the wrong reason).
3. **Semantic round-trip** — informalize the formal statement with a *separate* model and
   compare to your source NL. Catches drift.
4. **Bidirectional provability** — if a reference statement exists, prove `A ↔ B` via ATP /
   hammer. Strong but inherits the prover's weaknesses: false negatives when the prover is too
   weak, false positives on vacuously-true statements (which is why step 2 backstops it).
5. **Human expert spot-check** on a sample.

Never accept on typecheck alone. Never accept on a single LLM-as-judge alone — judges are
gamed by the same model families they grade, and even human experts produce semantic errors at
a high rate, so one judge is not a gate.

---

## 4. Scaling with the flywheel: sample-keep-verified-retrain; when to add search/critic

When you move from "formalize this one theorem" to "build/improve a prover" or "grind a large
blueprint," the durable engine is the **verifier-in-the-loop flywheel** — the recipe shared by
the prover families surveyed in `landscape.md`, and the part of the architecture that does not
depend on any specific model: pretrain/SFT a code-math model on proof-assistant data, then
improve it via **expert iteration / RL on kernel-checked outcomes.**

**The flywheel:**
1. **Sample** many proof attempts per goal (whole-proof and/or subgoal-decomposed).
2. **Keep only kernel-verified** attempts — the kernel is the reward signal; nothing
   unverified enters the training set.
3. **Retrain / iterate** the policy on the kept proofs; harder goals become reachable; repeat.
4. **Decompose** stubborn goals into subgoals, and use **compiler-feedback self-correction**
   (feed the error back, re-draft).

This loop is the architecture. **Elaborate tree search and critic/value models are optional
accelerants, not necessities** — reach for them only when whole-proof and best-first generation
*stall on proof depth.* The flip is purely about target depth: search/critic earn their keep
when the needed proof is deeper than the policy reaches in-context, and grow more necessary as
that depth rises. Below that, they are cost you don't need. The flywheel itself does not flip —
it underpins both regimes.

**One training-data caveat that the kernel does NOT fix.** Provers bootstrap by
auto-formalizing large NL corpora into formal *statements* to train on, so faithfulness defects
in that corpus propagate into prover behavior. RL filtering partly absorbs this: a
mis-formalized *unprovable* statement is simply never solved and drops out. It does **not**
absorb **vacuously-true or drifted-but-provable** training statements — those get solved, kept,
and actively teach the wrong thing. This is unmitigated by the verifier, which is why investing
in faithfulness tooling pays off twice: at deployment (trustworthy statements) and at training
(a cleaner flywheel).

---

## 5. `sorry`/`admitted` as a typed TODO list: tracking open obligations to closure

A `sorry` (Lean) or `admitted` (Rocq, formerly Coq) is not a proof — it is a **typed hole the
kernel accepts on faith.** A development with `sorry`s is a *typed TODO list*, and each `sorry`
is an open obligation. The discipline:

- **Verification depth is per artifact:**
  - Informal LLM draft (NL prose) → *exploration only.* Never cite as established.
  - Lean proof with **no `sorry`** and a statement that **passed the faithfulness gate** →
    *certified.*
  - Lean proof **with `sorry`/`admitted` lemmas** → a *typed TODO list*, not a proof.
  - NL "gold-medal"/chain-of-thought AI output → rhetorically rigorous but
    *machine-unverifiable*; do not present as established without formalization.
- **Track every `sorry` to closure.** Grep the codebase for `sorry`/`admitted`/`native_decide`
  abuse on every CI run; surface the count on the blueprint graph (a red node = an open
  obligation). A blueprint is *done* only at zero `sorry` with all statements gated.
- **A load-bearing `sorry` voids the kernel guarantee for everything downstream of it.** If
  lemma B's "proof" uses A and A is `sorry`, B is also unproved no matter how green it looks.
  Do not report a formalization as complete while load-bearing lemmas are stubbed.
- **Watch for trust-escape hatches besides `sorry`.** `axiom` declarations, `native_decide`
  (trusts the compiler, not the kernel), unchecked `@[implemented_by]`, or importing an
  unverified library all widen the trusted base. Audit them as you would a `sorry`.

The kernel guarantee holds **only** for the proof-given-statement, and only when the proof body
is genuinely closed. `sorry`-counting and statement-gating are the two ledgers that tell you
whether you actually have that.

---

## 6. Collaboration: many humans + agents against one blueprint; review discipline

The blueprint is what makes a *crowd* — humans and agents mixed — converge instead of collide.

**How to parallelize:**
- **One blueprint, many workers.** Each contributor (or agent) claims a node whose
  dependencies are *stated*. They prove against the prerequisite *statements*; the
  prerequisites can still be `sorry`. The DAG, not a chat thread, coordinates who does what.
- **Agents are workers, not reviewers of record.** An agent can draft proofs, run hammers,
  close `sorry`s, and propose new sub-lemmas. It must **not** be the authority that blesses a
  *statement* as faithful — that is the human's job and a separate judge model's job (and even
  then, never a single judge). Keep the faithfulness gate (§3) out of the same model that wrote
  the statement.
- **Compose at the statement boundary.** Because every node's contract is its grounded
  statement, two workers' contributions compose iff their shared statements match exactly.
  Lock statements (review them hard) before parallelizing proofs against them; churning a
  statement after others have built on it is the expensive mistake.

**Review discipline (what reviewers actually do):**
- **Review statements, not proof bodies.** The kernel certifies bodies. Reviewer effort goes
  to: is the statement faithful (gate passed)? does it match the blueprint node? did the proof
  silently strengthen a hypothesis or hit a degenerate/vacuous case? are the trusted-base
  escape hatches (§5) clean?
- **Never re-review what the kernel proved while skipping the statement** — the canonical
  inversion of effort. The kernel already checked the body (pointless to redo); the statement
  is the only thing at risk (and easy to skip).
- **Read any cited benchmark/capability claim adversarially** (`benchmarks-and-trust.md`):
  prefer *completed* blueprint nodes and library contributions as your evidence of capability
  over leaderboard percentages, which compound faithfulness error end-to-end and overstate
  real ability.

---

## 7. Anti-patterns (quick reference)

- **Green-check-as-truth.** Treating a kernel-passing formalization as proof of the *intended*
  theorem when the statement may be drifted, vacuous, or contradictory-hypothesis. The kernel
  never sees the gap between "stated" and "intended."
- **Formalizing into a definition vacuum.** Autoformalizing research-level statements without
  first ensuring the needed definitions/typeclasses exist and are in scope — where faithfulness
  collapses (§1).
- **Single-judge faithfulness.** Accepting a statement on one LLM-judge or on typecheck alone;
  both are gameable / near-worthless as solo gates.
- **Re-reviewing the kernel-proved body while skipping the statement.** Effort on the one thing
  not at risk; no effort on the only thing at risk.
- **Counting `sorry`-laden / admitted developments as done.** Each stub is an open obligation;
  a load-bearing stub voids everything downstream.
- **Treating NL AI proofs as verified mathematics.** Gold-medal-grade prose is unverifiable;
  it can hide errors no kernel ever saw.
- **Default-on tree search.** Adding search/critic machinery before whole-proof + best-first
  generation has actually stalled on depth — cost without need.
- **Statement churn after others have built on it.** Breaks composition at the contract
  boundary; lock and review statements before parallelizing proofs against them.

---

*Fast-moving specifics (model names, IMO results, benchmark percentages, library counts,
project timelines) live ONLY in the dated `state-of-the-art.md` snapshot — never hardcode them
into this workflow. The loop above is meant to hold as those specifics turn over.*

