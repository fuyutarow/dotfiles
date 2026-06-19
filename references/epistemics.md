# Epistemics: formal vs informal proof & open problems

The durable epistemic stance, and the research frontier. Everything here is foundation-level
and meant to age slowly; the one place with fast-moving numbers is the explicitly dated
snapshot at the end (and even there, treat figures as illustrative, not current).

## Table of contents
1. [Formal vs informal: complementary regimes, not competitors](#1-formal-vs-informal-complementary-regimes-not-competitors)
2. [When the kernel guarantee is worth its cost](#2-when-the-kernel-guarantee-is-worth-its-cost)
3. [What AI changes about proof epistemics — and what it does not](#3-what-ai-changes-about-proof-epistemics--and-what-it-does-not)
4. [Open problems, scored by importance × tractability](#4-open-problems-scored-by-importance--tractability)
5. [Dated snapshot — concrete grounding (as of mid-2026)](#5-dated-snapshot--concrete-grounding-as-of-mid-2026)

---

## 1. Formal vs informal: complementary regimes, not competitors

The two regimes answer different questions. Treat them as a division of labor, not a contest.

| | Informal (paper / referee) | Formal (proof assistant + kernel) |
|---|---|---|
| **What it certifies** | The *argument* is convincing to expert humans | The *derivation* type-checks against axioms |
| **Trust anchor** | Reputation, peer scrutiny, community memory | A small, audited logical kernel |
| **Failure mode** | Subtle gaps survive years (plausible-but-wrong) | Wrong *statement* formalized correctly (vacuous/misspecified) |
| **Cost** | Cheap to write, expensive to fully check | Expensive to write, cheap to re-check forever |
| **Best at** | Discovery, intuition, communicating *why* | Settling disputes, dependency-heavy edifices, reuse |

The deep point: **formality moves the trust boundary, it does not eliminate trust.** A machine
proof reduces "trust this 40-page argument" to "trust that the formal statement says what I
meant, and trust a kernel of a few thousand lines." That is a vastly better trust bargain — but
the residual *specification* risk (the De Bruijn statement-faithfulness problem) never goes to
zero. The most dangerous formal proof is a flawlessly checked proof of the wrong theorem.

Practical default: **reason and explore informally; formalize what must be trusted, reused, or
defended.** Do not formalize for its own sake, and do not treat an informal consensus as final
when the stakes (a long dependency chain, a contested result, a safety-critical claim) reward a
kernel-checked artifact.

## 2. When the kernel guarantee is worth its cost

Formalization has a real, often 10×+, up-front cost. Spend it where the kernel guarantee buys
something the social process cannot:

- **Long dependency chains.** When result D rests on A→B→C and each link is itself hard, a single
  undetected gap poisons everything downstream. Kernel-checking makes the chain *compositional*:
  once a lemma is checked, every later use is free and trustworthy.
- **Contested or surprising results.** When a claim would overturn belief or has resisted
  refereeing consensus, a formal artifact ends the dispute in a way no further human re-reading can.
- **Heavy reuse / library effects.** A formalized lemma is a permanent, machine-callable asset.
  The cost amortizes across every future proof that depends on it.
- **Case explosions and computation.** Proofs with thousands of cases or heavy computation
  (four-color-style) are exactly where human refereeing is *weakest* and the kernel is strongest.
- **Safety- or money-critical claims.** Where being wrong is catastrophic, the asymmetric cost
  justifies the asymmetric effort.

When the cost is **not** worth it: early exploration, one-off arguments no one will build on,
results whose value is the *idea* rather than the *certainty*, and anything where the bottleneck
is getting the *statement* right (formalizing a misspecified statement just gilds the error).

Rule of thumb: **the value of the kernel guarantee scales with how much will be built on top and
how badly a hidden gap would hurt.** If nothing rests on it and a gap is cheap to find later,
stay informal.

## 3. What AI changes about proof epistemics — and what it does not

AI shifts the *economics* of both regimes; it does not change the underlying trust model.

**What changes (economics):**
- **Informal generation gets cheap and fast.** LLMs produce plausible proof sketches at scale —
  which raises, not lowers, the value of an independent check, because plausibility and
  correctness have decoupled. A confident wrong proof is now the default failure, not the exception.
- **Auto-formalization lowers the formal entry cost.** Translating informal math into a proof
  assistant — historically the bottleneck — is increasingly automatable, narrowing the 10× gap.
- **Formal search gets stronger.** Learned provers close a meaningful fraction of benchmark goals
  that were previously out of reach.

**What does not change (epistemics):**
- **The kernel is still the only thing you trust.** An AI that writes a Lean proof earns exactly
  zero epistemic credit for being confident; the proof is trusted because it type-checks, full
  stop. This is the single most important durable fact: *AI does not need to be trustworthy for
  its formal output to be trusted.* That is the whole point of mechanized proof.
- **Specification risk gets worse, not better.** Auto-formalization introduces a *new* place for
  the statement to drift from intent. The faithfulness question (does the formal theorem mean what
  the human asked?) is now the dominant residual risk, and it is not kernel-checkable.
- **Informal AI output inherits informal epistemics — minus the reputation anchor.** An LLM proof
  in natural language has the failure mode of an informal proof (plausible gaps) without the
  social accountability that makes human informal proofs eventually self-correcting.

**The depth cliff.** Capability is not uniform across difficulty. On competition and
textbook-level targets, automated systems do well; on research- and graduate-level mathematics,
success rates fall off a cliff. The durable lesson is the *shape*, not the number: treat any
headline benchmark figure as a statement about a difficulty band, not about "math" — and assume
the cliff sits just past whatever the current frontier advertises. (For the current magnitude of
the drop, see §5.)

**Faithfulness has no automated certificate.** There is, as of writing, no sound, scalable,
fully-automated way to certify that a formal statement faithfully captures informal intent —
which is precisely why this is registered as an open problem (§4 #1), not a solved engineering
task. In practice the certificate is human: expert eyes on the *statement* (not the proof), plus
conventions like back-translation and stating the theorem several equivalent ways. Automated
theorem provers (ATP) certify the *derivation*; nothing yet certifies the *specification*.

## 4. Open problems, scored by importance × tractability

Scores are coarse (low / medium / high) and deliberately durable — they rank *structural*
difficulty, not this quarter's leaderboard. Importance = how much it unblocks if solved;
tractability = how attackable it looks with current methods.

1. **Faithfulness / specification certification.** *Can we mechanically certify that a formal
   statement matches informal intent?* — **Importance: very high. Tractability: low.** This is the
   one gap the kernel structurally cannot close; it bounds how much we can ever trust
   auto-formalized math. Today it is human-in-the-loop by necessity.
2. **Auto-formalization at research scale.** *Reliable informal→formal translation for genuine
   research mathematics, not just contest problems.* — **Importance: very high. Tractability:
   medium.** The single biggest lever on formal-math throughput; progress is real but quality and
   coverage at the research frontier remain unsolved.
3. **Premise selection / library navigation.** *Finding the right lemmas in a huge library.* —
   **Importance: high. Tractability: medium-high.** A retrieval problem that learned methods are
   visibly chipping at; arguably the most tractable high-leverage item.
4. **Generating reusable abstractions, not just closed goals.** *Proving in a way that yields
   library-quality lemmas and definitions.* — **Importance: high. Tractability: low.** Search
   optimizes for *closing this goal*; mathematical value lives in *good abstractions*, and we have
   no good objective for the latter.
5. **Verifier-faithful natural-language proof.** *Trustworthy informal proofs whose claims are
   machine-checkable on demand.* — **Importance: high. Tractability: medium.** The bridge that
   would let informal speed inherit formal trust.
6. **Compute efficiency of formal search.** *Frontier formal solves can require large compute
   budgets per hard problem.* — **Importance: medium. Tractability: medium.** A cost problem, not
   a possibility problem; expected to improve steadily with better search and models. (For the
   current order of magnitude, see §5.)
7. **Sustaining the formal-math commons.** *Keeping core libraries maintained, reviewed, and
   institutionally durable rather than dependent on a few volunteers.* — **Importance: high
   (everything formal rests on shared libraries). Tractability: rising as the activity
   professionalizes.** The open question is whether professional/philanthropic stewardship durably
   removes the volunteer bus-factor; the concrete funding moves are dated in §5.

Reading the table: items 1 and 4 are the *hard* ones (no clear attack), 2/3/5 are where effort
pays off now, and 6/7 are tractable-but-underinvested. If you have one bet, bet on 2 (it
unblocks everything downstream).

## 5. Dated snapshot — concrete grounding (as of mid-2026)

Everything below is **time-sensitive and will date**. It exists only to make the durable claims
above concrete. Treat figures as illustrative, not current, and re-check against primary sources.

**The depth cliff, quantified (the §3 number).** On graduate-/research-level targets, the
success rates that read as strong on competition and textbook benchmarks collapse into the single
digits — the concrete magnitude behind §3's "falls off a cliff."

**IMO 2024 (the reference point).** A formal system (DeepMind's AlphaProof + AlphaGeometry 2)
solved 4 of 6 problems — P1, P2, P6 via formal Lean search and P4 in geometry (AlphaGeometry 2,
in ~19 seconds) — scoring 28/42, one mark below the 29 gold threshold (silver). The gold
threshold of 29 was reached by 58 of 609 contestants; P6 (the hardest) was solved for full marks
by only 5 of 609. Training used ~80M auto-formalized statements drawn from ~1M informal problems,
and individual hard problems took up to three days of compute. (Reported in *Nature*, 12 Nov 2025.)

**IMO 2025 (treat as unverified).** Reports describe general-reasoning LLMs producing
gold-medal-level natural-language solutions, with formal Lean provers also performing strongly.
**The specific scores, the number of systems, and their official-grading status could not be
confirmed against a primary source for this snapshot — do not cite figures here without first
verifying them against the official IMO record or the labs' primary write-ups.** The durable
takeaway is direction, not magnitude: end-to-end natural-language reasoning is closing on what
previously required a formal pipeline.

**Benchmark SOTA (illustrative).**
- *DeepSeek-Prover-V2-671B*: ~88.9% on miniF2F-test (chain-of-thought, pass@8192) and 49/658 on
  PutnamBench.
- *Goedel-Prover-V2-32B*: ~88.0% / ~90.4% on miniF2F-test; the 8B variant reached ~84.6%, beating
  a model roughly 84× larger — evidence that data/method, not raw scale, drives formal-prover gains.
- *AlphaProof* (later figures): miniF2F-test reported rising from 96.3% to 99.6%, and PutnamBench
  to ~56%.

**Method note.** Several recent gains lean on test-time reinforcement learning (TTRL) — spending
extra compute at inference to adapt the prover to the specific problem — alongside large-scale
auto-formalized training data. This is an economics shift (more inference compute buys more
solves), consistent with §3 and open problem §4 #6.

**The commons, dated (the §4 #7 specifics).** A multi-million-dollar philanthropic effort to fund
formal-math infrastructure and maintainers (an "AI for Math"-style fund) went live in 2025,
beginning the shift from volunteer-dependent libraries toward professional stewardship. Whether
this durably removes the bus-factor is the open question in §4 #7.

---

## See also

Intended sibling reference files in this skill (one level deep from `SKILL.md`). **Ship this file
as part of the complete reference set; before publishing, confirm each target below actually
exists on disk and the link resolves — drop any that will not ship rather than leaving a dangling
link.**

- `../SKILL.md` — the skill overview and entry point.
- `landscape.md` — the tools, systems, and players.
- `workflow.md` — how to actually drive a proof assistant in practice.
- `benchmarks-and-trust.md` — what the numbers mean and how to read a leaderboard honestly.
