# architecture.md — 責務分界 + 局所化, and the deny-gate (G3 in full)

> The PURPOSE pole. Refactoring drives toward an architecture where every responsibility has one
> home (**責務分界**) and every likely change stays local (**局所化**). This file makes that
> *checkable* — so the model can pursue it AND harshly refuse its counterfeit (場当たり churn).
> Provenance: Parnas 1972 (read verbatim), Constantine *Structured Design*, Martin SRP/CCP, DDD.

## 0. The single unifying test (run this first)

> **For the change most likely to come next, how many separate places must you edit, and do they
> sit together?** Few + together = good 責務分界/局所化. Many + scattered = bad — **regardless of
> how clean each individual file/layer looks.** Every source below is one checkable refinement of
> this test.

Concretely, before proposing or accepting a decomposition: name the single most-likely next change,
then `Grep`/`Glob` where that change's code lives today and count the edit-set. Prefer the layout
where that count is 1 and the edits are adjacent. **Reject a refactor that increases the scatter of
a probable change even if each resulting piece looks cleaner.**

**Provenance gate on the next-change (hard precondition, not advice):** the most-likely-next-change
must be **cited from a real source** — an open issue #, a TODO at `file:line`, or `git log`
co-change frequency ≥2. A next-change you cannot cite is a hypothetical, and **a decomposition
justified by a hypothetical next-change is Speculative Generality (§6 over-refactor check) —
DENIED.** This closes the astronaut loophole where 局所化 is invoked on an invented future.

## 1. Parnas — 局所化 as a falsifiable predicate

Decompose by **hiding the design decisions likely to change (a module's *secret*)**, NOT by steps of
execution. A secret is a concrete thing: a **format, representation, algorithm, ordering, calling
convention**. The responsibility of a module IS the one volatile decision it hides.

- **局所化 predicate (checkable):** for each anticipated change `c`, `|modules touched by c| = 1`.
  Parnas's own demonstration: a flowchart decomposition lets a storage-format change hit *every*
  module ("changes in every module!"); an information-hiding decomposition confines it to one
  ("confined to that module!"). This is the discriminator, not a slogan.
- **Interface = a stability contract.** Expose only what is stable; hide what is volatile. Judge the
  boundary by **insensitivity**: after a boundary change, `grep` callers for any reference to the
  hidden fact (storage layout, sort order, wire format, buffer). **A caller reaching through to a
  secret = the boundary leaks → fix the boundary, don't just rename.** Cosmetic encapsulation
  (extract a module but return its raw internal struct) provides zero change-locality.
- **Bundle a data structure with its accessors/mutators as ONE module.** Direct field access
  sprayed across callers means a representation change is non-local. When touching a struct/record,
  `find_referencing_symbols` on its fields; external direct read/write → the refactor is to
  introduce accessors and move the knowledge inward.
- **Two orthogonal axes of "good structure" — check separately, report separately:**
  (A) one-home-per-secret with a stability-only interface (change-locality);
  (B) a **loop-free, backward-only `uses` DAG** (dependency-locality — low modules never depend on
  high ones, so a subset is prunable/shippable). Before an import that adds a cross-module edge,
  scan for a resulting **cycle** or a downward→upward edge; a cycle blocks the edit — **break it by
  splitting a module across levels ("sandwich"), do not add the back-edge.** Seeing layers ≠ no
  cycles; tidy modules ≠ no leaks. Do not claim "good architecture" from one axis.
- **Parnas's own YAGNI:** flexibility is a **deliberate, bounded** decision. Over-generalizing OR
  over-revealing an interface is itself a *design error*. Hide exactly the decisions on the grounded
  change list; drop knobs/layers that encode no anticipated change.

## 2. Constantine — cohesion (責務分界) and coupling (局所化), measured

**Cohesion — the one-sentence test (inside one module).** Describe everything the module does in one
sentence; the *grammar* gives the level, worst → best:

| Sentence shape | Cohesion | Signal |
|---|---|---|
| can't say it / "and" between unrelated things | coincidental / logical | name has `and`, or is `utils/misc/manager/helper` |
| "…during init / shutdown" | temporal | groups by *when it runs* |
| "first X, then Y" | procedural | groups by call-flow order |
| parts joined only by touching the same data | communicational | |
| "the output of X feeds Y" | sequential | |
| **one action, no connective ("compute the invoice total")** | **functional** ← aim here | |

**Coupling — read what crosses each edge (between modules), worst → best:** content (reach into
another's internals) → common (shared mutable global) → external (shared imposed format/device) →
**control** (pass a flag that steers the callee) → stamp (pass a whole record, use a field) →
**data** (pass exactly the scalars needed) → message.

**Law:** maximize cohesion *within*, minimize coupling *between*. They correlate → **raise cohesion
first** (a module that does one thing needs fewer, narrower inputs, so coupling drops for free);
re-classify coupling only after. Named fixes by class:

- **control coupling** (a `flag`/`mode` param the callee switches on) → **Remove Flag Argument**:
  split into named functions, caller chooses. Raises callee cohesion + drops edge to data in one move.
- **stamp coupling** (whole record, few fields used) → narrow the signature to the named scalars
  (grep the body for which members are actually touched first).
- **common coupling** (shared mutable global) → **Encapsulate** behind an owning module with narrow
  accessors; grep every read/write site first. Highest-priority locality fix. **Never add one more
  direct global read because it's convenient.**
- **temporal/procedural clump** (`init()`, `doEverything()`) → split **by responsibility** into
  functionally-cohesive units + a thin orchestrator that preserves order. **Never split by phase or
  by line-count** (an arbitrary midpoint split makes two low-cohesion halves that still share state).

## 3. Martin — SRP-actor, CCP, and the structuring-documents isomorphism

- **SRP ≠ "does one thing"** (aesthetic, uncheckable). It is **"one reason to change = responsible
  to ONE actor/stakeholder."** Checkable: name each public method's actor; count distinct actors;
  the failure signal is "a change for actor A breaks actor B." Split **on the actor line** — no
  named second actor → **no split** (splitting by noun/topic fragments one actor's cohesive logic:
  the SRP over-application smell).
- **CCP (Common Closure) = 局所化 itself:** gather into one component the classes that **change for
  the same reasons at the same times**. Checkable: trace one representative change, count components
  touched. High fan-out → things-that-change-together are split → **merge**. Different-reasons
  co-located → **split**.
- **Graph discipline:** ADP (no dependency cycles — break with an abstraction one side owns, DIP),
  SDP (depend toward stability), SAP (stable = abstract; a concrete high-fan-in hub is the "Zone of
  Pain" — why changes there break everything). Cycles and Zone-of-Pain hubs are **concrete defects
  ranked above cosmetic cleanups**, not style.
- **Isomorphism with `structuring-documents`** (the house's document skill): this is the same
  認識体系 applied to code. SRP one-home ≙ "every fact one home"; CCP single-update-point ≙ "a claim
  duplicated across sections → one locus"; Parnas/ADP backward-only `uses`-DAG ≙ the document's
  backward-only reference DAG. When the boundary is genuinely ambiguous, prefer **"Fits In My Head"**
  (the version a reader holds whole) over "max separation."

## 4. DDD / Conway / vertical-slice — demarcation at larger scale

- **Bounded context by LANGUAGE:** one identifier/term carrying two meanings in one module = a
  missing boundary → two models + an anti-corruption layer at the seam. Do **not** grow one god-model
  with a nullable field "for the other case" (couples unrelated contexts).
- **Aggregate by INVARIANT:** put inside one unit exactly what must be consistent atomically; reach
  other units by ID, reconcile eventually. "One aggregate per transaction." A transaction mutating
  several aggregates = a mis-drawn consistency boundary.
- **Conway:** module boundaries track team communication boundaries whether intended or not; a change
  needing high-bandwidth cross-team talk marks a mis-drawn boundary.
- **Vertical slice / package-by-feature > layered:** layered (controller/service/repository) scatters
  one feature across every layer (anti-locality); feature-folders co-locate it. Open the folder for
  feature X — is all of X there, and only X?
- **Locality of Behaviour > DRY when they conflict:** keep a unit understandable from itself; accept
  *small* duplication rather than an extraction that makes one behavior comprehensible only by
  chasing indirection across files. Record "LoB > DRY here" in the rationale.

## 5. Connascence — the locality rule for coupling

> **SOLE home of the connascence spectrum.** Any other file (including the SoK snapshot) quoting a
> connascence ordering defers to this list.

Connascence (Page-Jones; the Degree/Locality rules as popularized by Jim Weirich) grades coupling by
*what two elements must agree on*, weak → strong:

- **static** (visible in the source): **Name → Type → Meaning → Position → Algorithm**
  (Meaning = agreeing on what a value *means*, e.g. magic numbers — some authors write it "Value";
  this skill uses **Meaning** for the static form);
- **dynamic** (only visible at runtime, stronger than any static): **Execution(order) → Timing →
  Value(runtime invariants) → Identity**.

Two rules:

- **Rule of Degree:** convert strong to weak (magic value → named constant [Meaning→Name];
  positional args → named object [Position→Name]; duplicated algorithm → one shared function).
- **Rule of Locality:** **strong connascence must stay LOCAL** (same function/class); only weak
  connascence (Name/Type) may cross module boundaries. A refactor improves locality iff you can name
  a strong+distant connascence it weakened or pulled into one home.

## 6. The deny-gate — harshly separate principled refactoring from 場当たり churn

> **SOLE owner of the deny-gate wording** — G3 in SKILL.md is the abbreviation; the SoK §3.5 is the
> distillation snapshot; edits land HERE first. The gate is first-class because churn's counterfeit
> is cheap to ship and hard to detect (design posture; both failure directions in SoK §4.1).

**THE TWO-LINE DENY-GATE.** Before ANY structural edit (extract / inline / move / rename-for-structure
/ introduce-or-remove pattern / split-or-merge module), emit exactly two lines. **Each line must cite
a mechanical observation (a command you ran + `file:line`); a line with no citation is a vacuous
fill and counts as a FAILED gate** — self-certified prose is itself 場当たり:

1. **MOTIVE** — one of, **with evidence cited**:
   - `smell removed: <named smell> — <the citation that PROVES it>`, e.g. Shotgun Surgery: `git log
     --oneline -- <glob>` showing change X touched N files (list them); Feature Envy / Divergent
     Change: the `find_referencing_symbols`/`grep` hits at `file:line`; Wrong Abstraction: the
     flag/branch accretion at `file:line`.
   - `imminent change enabled: <the specific change I am about to make in THIS session>`.
   - `Rule-of-Three: <the three occurrences at file:line, file:line, file:line>` (the sampling
     meaning of the rule — do the callers move together? — is owned by `strategy.md` §4).
   - **Invalid fillers, always denied:** "future speedup" / "better design" / "cleaner" / "more
     SOLID" (Design-Stamina and DCF are GRADE-Low hypotheses — `strategy.md` §8); a named smell
     **without** its citation.
2. **PROPERTY-DELTA** — at least one, **citing the measured BEFORE state** so the delta is checkable
   against a pre-edit observation, not asserted post-hoc:
   - `cohesion raised: <module> <level>→<level> — one-sentence test before: "<the ...and/then...
     sentence>", after: "<the single-verb sentence>"` (§2 grammar);
   - `coupling lowered: <edge> <level>→<level> — before-state: <the grep/read that shows the flag /
     whole-record / global access at file:line>`;
   - `connascence lowered/localized: <strong>→<weak> / into <one home> — instance at file:line` (§5);
   - `responsibility relocated to one home: <resp> now lives only in <place>, localizing <the
     multi-file change>` — **REQUIRED sub-fillers for any split/relocate** (the anti-astronaut
     binding): the actor served `<A>`, the **named distinct second actor** `<B>` (a stakeholder/role,
     not a noun/topic), and the concrete change-for-A-that-breaks-B, **cited**. Cannot name a real
     second actor + cross-break → the split is **DENIED as SRP-over-application** (fragmenting one
     actor's cohesive logic — §3).

**If you cannot write BOTH lines with cited fillers, the edit is 場当たり churn and MUST NOT
happen.** Leave the working code; say why. This gate gates `Edit` / `Write` / `replace_symbol_body`
/ `rename_symbol` / `move`.

**Supporting rules:**

- **SMELL ≠ EDIT.** On detecting a smell, the next tool call is a **Read/investigation**, never an
  Edit. Confirm a named deeper problem; if fine, record "investigated, left as-is" and make NO edit.
  A smell alone never fills the MOTIVE line. (An agent that edits every long function / duplication
  on sight is mistaking smell-density for a to-do list.)
- **Over-refactor check (before ADDING abstraction/layer/pattern/param):** a **present** consumer
  must exist. No present caller → Speculative Generality (YAGNI violation) → do not add it. Prefer
  refactoring **away**: inline a Middle Man, collapse a one-subtype hierarchy, replace an
  over-applied Strategy/Factory with a conditional. **Pattern/abstraction REMOVAL passes the gate**
  (`smell removed: Speculative Generality / Middle Man` + `connascence lowered`).
- **Wrong-abstraction reversal is legal.** A shared abstraction accreting params+conditionals to fit
  divergent callers → **re-inline into each caller** (keep only that caller's branch). Adding
  param/conditional #N to a discriminating abstraction is **denied** as churn that deepens the wrong
  abstraction (Metz).
- **No "while I'm here."** A structural change may not ride inside a behavior-change diff. If it
  passes the gate on its own → split it into its own commit; if not → drop it. (G1.)

## 7. The YAGNI reconciliation — one cut, not a tug-of-war (D9)

Pursuing 責務分界/局所化 does **not** contradict YAGNI. They are the same checkable cut on the
**motive-direction × provenance** moderator — *is the failure this demarcation pushes back on
present in the code I'm touching, or a future axis I'm predicting?*

**The 3-slot MANDATORY test** (state in one sentence before touching): *"the present named smell this
demarcation pushes back on is ___ (a real Shotgun Surgery / Divergent Change / Feature Envy /
lockstep-requiring knowledge-duplication, **cited** per §6), its real occurrences number ___ now
(**≥3** — the sampling meaning of Rule of Three, and DRY-vs-AHA, are owned by `strategy.md` §4 —
or safety-critical), and this edit is behavior-preserving with oracle ___ (green test / engine
precondition / characterization test)."*

- **All three slots concrete → Regime A: MANDATORY, refactor mercilessly** — but only **within the
  surface of the change at hand** (no whole-module reformat).
- **Any slot filled with "might become ___ in future" / "it'll be cleaner" / "N=1 but good design",
  OR it fails the depth test** (name+signature can't let a caller skip the body) → **Regime B: YAGNI
  STOP** — inline the duplication and **wait for the third real occurrence.**
- **Regime C: safety-critical override** (crypto / tax / auth / wire formats) — one drifted copy is a
  live bug, so localize even below 3 occurrences (`strategy.md` §4).
- **MOVE/SPLIT branch (not exempt from a present-driver floor):** the ADD direction is gated by ≥3
  occurrences; the **relocate/split direction is gated by the named second actor + cross-break**
  (§6's required sub-fillers). "This class does too much" with no named second actor is the
  SRP-over-application smell, not a driver — DENIED.

**Flips:** B→A when a tolerated duplicate starts requiring lockstep edits, or the 3rd occurrence
lands (a future axis turned present). A→B when a new caller needs a flag/branch through your
abstraction (it was coincidental — inline it back), or the pass spills past the change surface, or
you're about to touch structure with no oracle. **Never justify a demarcation by volume — line
count, number of abstractions, or "more SOLID". Run the depth test.**
