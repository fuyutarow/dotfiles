# Landscape — proof assistants, AI provers, and AI4Science, durably

The **durable** map of the field: how the pieces fit, what each layer guarantees, and how to
choose — written to outlive specific model names, benchmark numbers, and competition outcomes.
Every fast-moving fact (named systems, kernel line-counts, library sizes, model sizes, benchmark
percentages, IMO outcomes, funding figures) lives ONLY in the sibling dated file
**`state-of-the-art.md`** ("State of the art (as of <month year>)"). This file carries the
structure and the decision rules; that file carries the snapshot. When they disagree, that file
is newer.

## Contents

- [§1 The stack: four layers, and what each one actually guarantees](#1-the-stack)
- [§2 Kernel architecture taxonomy — and why "trusted" is not "faithful"](#2-kernel-architecture)
- [§3 Choosing a proof assistant — one default, with escape hatches](#3-choosing-a-proof-assistant)
- [§4 The durable AI-prover recipe — what every serious system shares](#4-the-durable-prover-recipe)
- [§5 The three inference paradigms — default, with an escape hatch](#5-three-inference-paradigms)
- [§6 The automation layer: hammers and premise selection](#6-the-automation-layer)
- [§7 AI4Science: when formal proof helps, and when "gravity" forbids it](#7-ai4science-gravity)

---

## §1 The stack {#1-the-stack}

Four layers, bottom to top. Each layer trusts only the one below it; the value of the whole stack
is that you can audit the bottom and inherit its guarantee up the chain.

| Layer | What lives here | What it guarantees | What it does NOT guarantee |
|---|---|---|---|
| **Kernel** | the tiny proof-checker | every accepted term is a valid derivation in the logic | that the *statement* you proved is the one you meant (**faithfulness** — §2) |
| **Elaborator / tactics** | the language you write proofs in | convenience; reduces a goal to kernel-checkable terms | soundness — a buggy tactic can only *fail to produce* a term, never forge one past the kernel |
| **Library** | the corpus of proved theorems + definitions | reuse; shared vocabulary; the training/retrieval substrate (§4) | that *your* domain is covered, or that growth continues (§7 axis 4) |
| **Prover (AI or human)** | searches for the proof | nothing by itself — its output is only as good as the kernel that checks it | correctness; the kernel is the arbiter, not the prover |

**The load-bearing inversion:** the prover can be a black box, hallucinate freely, and be wrong
most of the time — and the stack is still sound, because *the kernel checks every result*. This is
why "AI prover" is not an oxymoron: you are not trusting the AI, you are trusting the checker. All
the engineering effort that looks like it is about making the prover smarter is, structurally,
about making the prover *productive* — the kernel already makes it *safe*.

---

## §2 Kernel architecture — and "trusted" ≠ "faithful" {#2-kernel-architecture}

### The de Bruijn criterion

A system satisfies the **de Bruijn criterion** if proofs can be independently re-checked by a
*small, simple, separable* program — small enough that one person can read and trust it. This is
the durable design principle that makes the whole soundness story credible: the trusted base is
auditable by a human, and an independent checker can re-verify a proof the original system
produced. "How big is the kernel" is the standard proxy for "how much do I have to trust" — the
actual line-counts and which systems pass cleanly: `state-of-the-art.md`.

### Kernel-architecture taxonomy

Three durable shapes, trading trusted-base size against convenience:

1. **Small fixed kernel** — one minimal checker, everything else elaborates down to it. Smallest
   trusted base; strongest de Bruijn story. The dominant shape for modern AI-targeted provers.
2. **LCF-style / theorem-as-abstract-type** — soundness enforced by an abstract `theorem` type
   whose only constructors are the inference rules. The "kernel" is the module that owns that
   type; tactics are ordinary code that can only *combine* theorems, never fabricate one.
3. **Reflection / computation-in-the-kernel** — the kernel can *run* a verified decision
   procedure and trust its result. Powerful (whole proof steps become a computation) but it
   *enlarges* what the kernel must be trusted to do correctly.

### The faithfulness gap (the structural core)

> **The kernel guarantees that the proof is valid. It does NOT guarantee that the theorem says
> what you think it says.**

A formal proof is a proof *of a formal statement*. If the formalization is wrong — a quantifier
flipped, a hypothesis silently assuming the conclusion, a definition that does not match the
informal object, a `sorry`/axiom slipped in — the kernel will happily certify a perfect proof of
the *wrong* thing. This gap is called **faithfulness**, and it is where essentially all real risk
in formalized mathematics lives, because the kernel risk is, by design, near zero.

Durable consequences (these do not go stale):
- **Review the statement, not the proof.** The proof is machine-checked; the *statement* and its
  *definitions* are not. Human review effort belongs on the spec, the defs, and the hypotheses.
- **Audit the axiom/`sorry` footprint.** Whatever your system's mechanism is for listing the
  axioms a theorem depends on, run it: an admitted lemma or an extra axiom can make any statement
  provable.
- **Trust the statement only as far as you trust its definitions.** A theorem about a custom
  predicate is only as meaningful as that predicate is faithful to the intended object.
- **An AI prover does not widen this gap** — it still must satisfy the kernel — **but it widens
  the *exposure*:** it can auto-formalize statements at a scale no human reviews, so the
  faithfulness burden shifts onto the *auto-formalizer* and onto statement-level checks.

---

## §3 Choosing a proof assistant {#3-choosing-a-proof-assistant}

Evaluate any candidate on four durable axes; then take the default unless an escape-hatch row
fires.

**The four durable axes:**
1. **Trusted base** — kernel size/architecture; de Bruijn story (§2).
2. **Automation reach** — tactic language power; hammer maturity; neural-prover support (§5–§6).
3. **Library gravity** — size, coverage of *your* domain, and rate of growth (§7).
4. **Community & funding durability** — bus-factor, institutional backing, continuity of the
   ecosystem.

### The default

> **Default to the system with the largest unified, continuously-growing, AI-prover-targeted
> library ecosystem and a small fixed kernel.** Library gravity (§7) compounds and is the hardest
> thing to replicate; a small kernel keeps the trusted base auditable. This is where the AI-prover
> tooling, the training corpora, and the retrieval substrate concentrate, so it is the safe choice
> for a *new* formalization or AI-prover project absent a specific reason below.

(Which concrete system this is, its kernel size, its current library statistics, its funding and
bus-factor status: `state-of-the-art.md`.)

### Escape hatches — take a different system only when one of these fires

| If your dominant need is… | Prefer… | Durable rationale |
|---|---|---|
| **Maximal push-button automation, no neural prover** | the automation-first HOL ecosystem | the most mature push-button hammer plus broad applied-library coverage, without needing a neural prover |
| **Heavy dependent-type / program-extraction / verified-software** | a dependently-typed system built around extraction | proofs *are* programs; you get certified executables, not just theorems |
| **Set-theoretic foundations / classical-mathematics archive depth** | a classical, set-theory-based system with a large curated archive | matches mainstream mathematical practice; deep, vetted, long-lived corpus |
| **A foundations/HoTT or type-theory research agenda** | the system whose foundations *are* your object of study | the foundation is the point; library gravity is secondary |

Pick the row whose need is *dominant*; if none fires, take the default. Do not assemble a menu —
the cost of a smaller ecosystem (§7 axis 3) is paid continuously, so deviate only for a real,
named requirement.

---

## §4 The durable AI-prover recipe {#4-the-durable-prover-recipe}

Strip away the model names and the leaderboards, and every serious AI prover is the same loop —
this is the part that does not go stale.

1. **Formal environment as ground truth.** A proof assistant whose kernel gives a crisp, cheap,
   non-gameable reward: *did the proof check?* No reward model can be hacked the way a learned
   scorer can — the kernel is the verifier.
2. **Autoformalization to manufacture data.** Human-written formal proofs are scarce, so generate
   statements (and often proofs) at scale by translating informal/seed material into the formal
   language. This is the bottleneck and the lever; it is also where the **faithfulness exposure**
   of §2 concentrates — bad auto-formalization poisons everything downstream.
3. **Search over the proof state.** Tree/best-first search, sampling many tactic candidates per
   state, expanding promising lines. Compute is spent here.
4. **The data flywheel.** Verified proofs (including newly solved hard problems) are fed back as
   training data, which makes the prover stronger, which solves harder problems, which produce
   more verified data. Self-reinforcing; this is the field's central dynamic.

**The flywheel is the moat, not the model.** Any specific model is a snapshot; the durable asset
is the loop — environment + autoformalizer + search + feedback — plus the library gravity (§7)
that the corpus is anchored to. Evaluate a prover effort by the health of its flywheel, not by its
latest benchmark row.

(Specific systems, model sizes, training-data volumes, compute budgets, and benchmark numbers:
`state-of-the-art.md`.)

---

## §5 Three inference paradigms {#5-three-inference-paradigms}

How a neural prover actually emits proof steps. Three durable shapes:

1. **Whole-proof generation.** The model writes a complete proof script in one (or a few) shots;
   the kernel checks it; failures trigger resampling or repair. Cheap per attempt, high variance,
   trivially parallel. Improves fastest as base models improve.
2. **Step/tactic-level with search.** The model proposes one tactic per proof state; an explicit
   search (tree/best-first) over states drives the process. More compute and engineering, but it
   solves problems whole-proof generation cannot reach because the search backtracks.
3. **Hybrid / informal-then-formal (sketch-and-fill).** Reason informally (a natural-language or
   high-level proof sketch), then formalize each step, falling back to search or a hammer (§6) to
   discharge sub-goals. Mirrors how humans formalize.

### Default with an escape hatch

> **Default to whole-proof generation, and escalate to step-level search only for goals it cannot
> close.** Whole-proof generation is the cheapest to build, parallelizes trivially, and rides base-
> model improvements for free; reserve the heavier search machinery for the residue of hard goals
> where backtracking actually pays for its cost. Use hybrid sketch-and-fill when you have a strong
> informal reasoner and a good hammer to lean on.

(Which paradigm currently leads on which benchmark, and by how much: `state-of-the-art.md`.)

---

## §6 The automation layer: hammers and premise selection {#6-the-automation-layer}

Between hand-written tactics and full neural proving sits the **hammer** layer — the durable
workhorse, often underrated next to flashy neural results.

- **A "hammer"** discharges a goal by (a) **premise selection** — choosing a relevant handful of
  facts from a huge library — then (b) handing the goal + premises to external **automated theorem
  provers** (first-order/SMT), and (c) **reconstructing** any found proof back into a
  kernel-checkable term. Soundness is preserved because step (c) re-checks through the kernel; the
  external prover is just an untrusted oracle.
- **Premise selection is the hard, durable sub-problem.** Library size makes "which lemmas matter"
  the bottleneck for *both* hammers and neural provers; it is the same retrieval problem, and
  progress on it lifts the whole stack. Treat premise selection as a first-class component, not an
  afterthought.
- **Hammers compose with neural provers** (the hybrid of §5): use the hammer to close routine
  sub-goals so the expensive neural search is spent only on the genuinely hard steps.

(Which systems ship which hammers, the named ATP/SMT backends, and the historical
Sledgehammer-vs-Lean-hammer maturity gap with its timeline: `state-of-the-art.md`.)

---

## §7 AI4Science: when formal proof helps, and when "gravity" forbids it {#7-ai4science-gravity}

Formal proof is one tool in the broader **AI-for-science** push, but it is the *rare* case: most
of science has no kernel. The durable decision rule is about **gravity** — the gravitational pull
toward a domain where formal methods can actually land.

**Gravity** = the presence of (i) a crisp, machine-checkable notion of "correct," (ii) a library
to stand on, and (iii) a flywheel that can spin (§4). Where gravity is strong, formalize and let
the kernel govern. Where it is weak, the honest answer is empirical validation, not a proof.

### The gravity decision table

| Your target has… | Gravity | Do this | Escape hatch |
|---|---|---|---|
| A formal statement + a kernel (pure math, verified software, protocol/crypto proofs) | **Strong** | Formalize; let the kernel be the arbiter; build the flywheel (§4) | If the *spec* is the doubtful part, spend effort on faithfulness review (§2), not more proving |
| A formalizable model but a contested/empirical ground truth (physics derivations, formal-but-modeled systems) | **Partial** | Formalize the *deductive* core; keep the modeling assumptions explicit and outside the kernel | If assumptions dominate the result, the proof certifies a *conditional* — say so; do not oversell |
| No formal notion of correct (most ML, most natural-science discovery, most "reasoning" claims) | **Weak/none** | Do **not** dress empirical results as theorems; use benchmarks, ablations, replication | If a sub-component *is* formalizable (a bound, an invariant, a safety property), carve it out and formalize *that* |

**The durable warning:** the value of a formal proof comes entirely from the kernel-backed
guarantee (§1) constrained by faithfulness (§2). Applying the *language* of proof to a domain with
no kernel buys nothing and launders empirical claims as certainties. Let gravity decide: formalize
where a kernel exists and a library gives you somewhere to stand; everywhere else, validate
empirically and carve out only the genuinely formalizable sub-parts.

(Current AI4Science results, which domains have crossed into "strong gravity" lately, and named
projects: `state-of-the-art.md`.)

