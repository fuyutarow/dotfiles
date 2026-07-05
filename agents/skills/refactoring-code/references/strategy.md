# strategy.md — WHETHER/WHEN to refactor, and HOW to do it BIG

> The decision layer (should I, now?) and the large-scale mechanics (how, without a long-lived
> branch). The moderator for each debate is in `tests/refactoring-survey-sok.md` §3. Provenance:
> Fowler, Beck *Tidy First?*, Spolsky, Humble/Farley, Ellnestam/Brolund, DORA/Accelerate.

## 1. The two hats (sequencing detail — the invariant itself is G1)

You wear the **adding-function** hat OR the **refactoring** hat — never both at once (the invariant,
its edited-assertion tell, and the split-diff artifact are owned by **SKILL.md G1**). Adding function
adds capability + new expectations; refactoring restructures and **never changes behavior
expectations** — it may be *preceded* by characterization tests that pin current behavior
(`safety-net.md` §2, part of building the net, not part of the structural diff), and only adjusts
existing tests mechanically where code moved. **Swap often, but know which hat is on.**

## 2. When to refactor — mostly opportunistic, always motivated

Refactoring is **not a scheduled phase**; it is woven into the work ("you refactor because you want
to do something else"). The high-value triggers:

- **Preparatory** (the best one) — *make the change easy (this may be hard), then make the easy
  change* (Beck). Refactor right before the feature that needs it, as its own green commit — **not
  speculatively**. This is where `refactoring-code` and `implementing-and-debugging` co-fire.
- **Comprehension** — as you grok code, move the understanding back into it (rename/extract).
- **Litter-pickup** — clean a little as you pass through, without derailing the task.
- **Rule of Three** (Beck, credited to Roberts) — first time, just do it; second, wince and duplicate
  anyway; **third time, refactor**. Do not abstract on the 2nd occurrence.

**When NOT to refactor** — throwaway/spike code, code slated for deletion, code you don't need to
modify. Under a deadline, prefer the smallest targeted change and **name the debt** (deliberate +
prudent) rather than a risky big cleanup you have no time to test (the deferred-payoff claim behind
"refactor anyway" is the Design-Stamina *hypothesis* — GRADE Low, §8 — not a fact to spend deadline
risk on). If a pass tangles structure with behavior, restart cleanly rather than untangling a mixed
diff in place: set aside **your own** uncommitted changes with `git stash` (recoverable) and redo the
tidying alone — never a destructive `git checkout .` / file-restore without explicit user approval.

## 3. Tidy first / after / never (D2) — the option-pricing rule

Beck *models* cleanup as an **option** — pay a small premium now for a cheaper later change. This
DCF/optionality framing is a **conceptual model, GRADE Low (§8), not a measured fact**; what it
licenses operationally is only the coupled case below. The decision quantity: **(coupling of the
tidy to the pending edit) × (probability the code is touched again soon) × (your comprehension
level)**:

- **FIRST** — the cleanup is on the path of the edit you're about to make AND you already understand
  the code AND the change is likely to survive: the tidy is coupled to a present, in-session edit
  (this is what the moderator licenses — a present-grounded coupled edit, not a promised speedup).
- **AFTER** — comprehension is low, or the change is an uncertain spike, or the mess isn't on the
  critical path. Make the behavior change first, confirm it survives, THEN tidy the parts it taught
  you, as a **separate behavior-preserving commit.**
- **NEVER** — expected future-touch count ≈ 0, or the tidy is decoupled from any pending change
  (speculative). And **never** as a big-bang rewrite (§5).

## 4. DRY vs AHA/WET (D6) — is the axis of change known yet?

> **SOLE home of Rule of Three and the DRY-vs-AHA cut.** `architecture.md` §7's ≥3 threshold and
> `catalog.md`'s duplication row point here for the *meaning*: three is a **sampling procedure**,
> not a magic count.

DRY governs **knowledge duplication** (one fact, one owner, changes in lockstep — a business rule,
invariant, protocol constant): dedup immediately, divergent copies are silent bugs. AHA/WET governs
**coincidental duplication** (looks alike, evolves independently): keep it — a wrong abstraction's
exit cost is asymmetric (Metz: "duplication is cheaper than the wrong abstraction"). The **Rule of
Three is the sampling procedure** that tells you which: wait until three real callers reveal whether
they move together (→ abstract) or apart (→ leave duplicated). **Reversibility is the tiebreaker** —
duplication is almost always cheaper to leave than a live abstraction with dependents. **Exception:**
safety-critical constants (crypto/tax/auth/wire) → DRY even below three (one drifted copy is a live bug).

## 5. Rewrite vs refactor (D3) — reachability, not courage

The decision variable is **reachability**: is the target architecture connected to the current one by
a continuous sequence of behavior-preserving steps, and is the embedded knowledge still capturable?
**Default to incremental** (Strangler Fig + characterization tests strictly dominate). A from-scratch
rewrite is justified only when **all** hold: (a) the target is provably **unreachable** by
behavior-preserving steps (dead runtime, a data-model/architecture discontinuity no local edit
sequence terminates at), AND (b) current behavior **cannot be characterized** (no tests, no author,
re-specifiable from a fresh spec), AND (c) the embedded behavior is cruft you don't want. If even one
fails → stay incremental. Spolsky's warning ("never rewrite"): a rewrite discards the thousands of
bug-fixes encoded in "ugly" code — *it's harder to read code than to write it.* Beware the
**second-system effect** (over-scoping the replacement). **Even when a rewrite is justified, prefer a
Strangler (facade + old system as live fallback) over big-bang.** A rewrite is a **labeled bet**, not
a silent "refactor" — surface it as a decision.

## 6. Prioritization — which smell first (hotspots)

You can't refactor everything. Rank by **hotspot = high complexity × high churn** (Tornhill, *Your
Code as a Crime Scene* / *Software Design X-Rays*): use `git log` change-frequency × a complexity
signal (McCabe cyclomatic / Cognitive Complexity) to target the code that is both tangled AND
changing. A tangled file nobody touches is not worth the risk; a churning tangled file is where
refactoring pays. Rank cycles and Zone-of-Pain hubs (`architecture.md` §3) above cosmetic cleanups.

## 7. HOW-BIG — large behavior-preserving change without a long-lived branch (D8)

The primary risk object is the **long-lived branch** (merge cost grows super-linearly with age;
semantic conflicts the VCS can't see; a rewrite branch races a moving trunk it never catches). Keep
trunk **always green**, ship the transformation as many small releasable commits. Default to finding
a **seam where old and new cohabit**:

- **Branch by Abstraction** (Humble) — (1) introduce an abstraction over the old impl, (2) route all
  callers through it (small commits), (3) add the new impl behind the **same** abstraction (both
  coexist), (4) flip callers, (5) delete the old impl + optionally the seam. Never delete-and-rewrite
  in place.
- **Parallel Change / expand–migrate–contract** — for a backward-incompatible interface/schema/API:
  ADD the new form alongside the old (expand, nothing breaks) → migrate callers incrementally →
  REMOVE the old form (contract) only after all callers moved. Never hard-rename a signature + fix
  all call sites in one commit if external callers exist. **Schedule the contract step** — two
  parallel APIs left forever is "worse than you started."
- **Strangler Fig** — to replace a whole system: stand the new path beside the old behind a
  facade/router, route ONE slice at a time, verify, move the next, until the old is strangled and
  removed. Keep the legacy path live and releasable throughout. Refuse a big-bang rewrite of a
  working system.
- **Mikado Method** — for a large tangled change: naively attempt the goal, let it break, **record
  each prerequisite it surfaces as a dependency-graph node, then REVERT to green.** Do leaves first
  (prereqs with no further prereqs), bottom-up, each its own green step. **Do not dig forward
  through a growing pile of red** — on the first explosion, capture the prereq list, set aside
  **your own** probe edits with `git stash` (recoverable; a destructive `git checkout .` needs
  explicit user approval), and re-plan bottom-up.
- **Keystone Interface / feature flags** — ship incomplete work by **hiding** it, not branching:
  build+integrate the back-end first (tested but unreachable), add the tiny user-visible entry point
  LAST. Use a flag only when the entry point can't be a simple keystone; guard the **smallest**
  surface and **schedule its removal** (a flag is scaffold with a carrying cost, not permanent config).
- **Codemods at scale** — to apply one refactoring across a huge/multi-repo codebase, use
  recipe/AST-based automation (jscodeshift, OpenRewrite, Google LSC/ClangMR) rather than hand edits;
  the transform is written once, verified, and applied mechanically. If you bound coverage
  (top-N files, sampling), **say what was dropped** — silent truncation reads as "covered everything."

## 8. Epistemic honesty — the motivational claims are hypotheses

The **Design Stamina Hypothesis** ("good design makes you faster long-term") and Beck's
**DCF/optionality** economics are **conceptual models / hypotheses, not measured facts** (GRADE
**Low**; full GRADE bookkeeping lives in `tests/refactoring-survey-sok.md` §5.1). The one operative
rule: **"future speedup" / "better design" / "cleaner" is never a valid MOTIVE filler** — the
deny-gate denies it (`architecture.md` §6). Ground a refactor in a **present** cited smell +
property-delta, not in a promised future.
