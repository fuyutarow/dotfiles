# safety-net.md — name your oracle before you touch (G2 in full)

> The SAFETY pole. "Behavior-preserving" is trustworthy exactly when a **mechanical arbiter** would
> FAIL on a slip. Preservation you cannot mechanically detect the violation of is folklore, not an
> invariant. Provenance: Feathers *WELC*, Opdyke, empirical SE (Murphy-Hill, Bavota), Ousterhout.

## 1. The three oracle regimes — which branch are you in?

Every refactoring step needs an oracle that behavior is unchanged. There are exactly three, and an
**LLM hand-editing text is never in Regime 1** — its default is the strict branch.

| Regime | Oracle | When it holds |
|---|---|---|
| **1 — tool-verified** | the refactoring engine's checked **precondition** | a real engine (LSP rename, gopls/Roslyn/rope, ast-grep/comby/codemod) performs an atomic Rename/Extract/Move/Inline/Change-Signature. Tests are optional defense-in-depth. **The agent is here ONLY if it actually invokes the tool.** |
| **2 — manual & local** | a human/agent **eyeball** | a hand edit whose entire effect fits in one screen / one reviewer's working memory, no shared mutable state, no reflection/serialization/public-API/concurrency crossed. Tests strongly advised. |
| **3 — manual & non-local** | a **test/characterization** bracket | anything larger, or crossing a coupling a tool can't statically prove. **Feathers holds absolutely: characterization tests first, no exceptions.** |

**The reflex (G2):** before edit #1, say which regime and name the oracle. If you can't name one and
the edit crosses reflection / serialization / DI / public-API / concurrency, or exceeds one screen →
**do not touch; install the bracket first.** Only claim "done" after a **green run on the final
state**, cited. A refactor with no executed test evidence is *unverified*, not done.

## 2. Characterization tests — pin CURRENT behavior (Feathers)

"Legacy code = code without tests." To refactor untested code, first pin what it **actually does
today**, discovered by running it — **not what the spec or the name says it should do**:

1. Write a test asserting something; run it; read the **actual** output; **bake the actual value in.**
2. If a characterization test reveals a **bug**, pin the buggy behavior, flag it separately, and do
   **NOT** fix it in the refactor pass (G1 — two hats).
3. **Never delete/simplify code you don't understand while it's untested** — an "unused"/"weird"
   branch is often load-bearing (a past bug fix). Get it under a characterization test first, so the
   deletion is *proven* behavior-preserving.

**The Legacy Code Change Algorithm** (do the behavior change LAST): identify change points → find
test points → **break dependencies** → write tests → change & refactor. First tool actions are
`Grep`/`Read` + test scaffolding; the behavior-changing Edit is the final step, gated on green.

## 3. Seams — get code into a test harness without editing it under test

A **seam** is a place to alter behavior without editing there; its **enabling point** is where you
choose the alternative. Substitute a collaborator at the seam so **production code stays
byte-identical** — never add an `if (testing)` branch to production.

- **object seam** — subclass/interface override (the default in OO);
- **link seam** — build/classpath/dependency swap;
- **preprocessing seam** — macro/`#define` (C/C++).

When "this class won't go into a harness," name the **specific** cause and apply the matching
dependency-breaking technique (do the **smallest** move, prefer compiler/IDE-verifiable ones — do not
rewrite the class):

- constructor does I/O or needs heavy params → **Parameterize Constructor** / Extract Interface;
- internal object creation → **Extract and Override Factory Method**;
- a bad method blocks instantiation → **Subclass and Override Method**;
- add new behavior you can't fully test now → **Sprout** (new tested unit + one-line call) or
  **Wrap** — do **not** weave new logic into the untested body.

## 4. Is the net actually tight? — beyond hand-written tests

A **coincidentally-green** suite gives false safety. When the oracle must be strong or built from
scratch:

- **Mutation testing (PIT / Stryker)** — validates the net is strong enough to catch a botched
  refactor (surviving mutants = gaps in the bracket). Run before trusting green on a risky refactor.
- **Golden-master / approval testing (ApprovalTests; the Gilded Rose kata)** — capture the full
  output of a black box over many inputs as the oracle when unit tests are thin.
- **Record-replay** — for a legacy black box: record real I/O, replay as the characterization oracle.
- **Property-based / metamorphic testing** — bracket a refactor by invariants/relations when
  example-based tests are sparse.
- **Scratch refactoring** (Feathers) — aggressively restructure in a **throwaway** branch purely to
  *understand*, then **revert** and do the real, tested change. **Effect sketching** — map the
  blast-radius (what a change propagates to) before touching.

## 5. "Behavior-preserving" is relative to a DECLARED observable surface

Behavior preservation holds only up to a chosen observable equivalence. **"Same return value" ≠
"preserves behavior."** Flag and cover these axes when the code touches them — they are part of the
contract callers depend on:

- **timing / clock**, **concurrency / interleaving** (reordering statements changes interleavings),
- **exception type / error messages / error codes**, **iteration / ordering**, **object identity**,
- **resource use / memory / allocation / tail-latency**,
- **serialization / wire format**, **self-inspecting code (reflection)**,
- **operational signals — logs, metrics, traces**: in distributed/observable systems these ARE the
  contract; a "pure" functional refactor can still break an SLO or an alert.

The oracle must exercise **whatever the caller actually depends on**, not just functional I/O. If a
non-functional observable matters and the test suite ignores it, treat the change as
behavior-changing until proven otherwise.

## 6. The AST-vs-text gap — why an agent must prefer tools, and still bracket them

- **You edit token streams; an IDE edits a verified AST with precondition checks.** So for
  Rename/Extract/Move/Inline/Change-Signature, **delegate to a real tool** (LSP `rename_symbol` /
  `find_referencing_symbols`, ast-grep, comby, jscodeshift, OpenRewrite, codemods) rather than
  emulate one with text search-replace — the tool updates ALL references and respects scoping.
- **Before any rename/move, hunt for NON-STATIC references** the tool (and a naive grep) miss:
  reflection, string-keyed lookup, config files, serialization keys, DB columns, DI wiring,
  public/published API. `grep` the symbol **as a string**, and search config/serialization/build
  files — a dynamic reference the tool can't resolve widens the surface or blocks the change.
- **Tools ship behavior-changing bugs too.** Real IDE Rename/Extract engines have captured/shadowed
  variables and reordered side effects. "Prefer the tool" is **not** "trust the tool blindly" —
  **keep a test bracket even on tooled refactors** on risky code.
- **Dynamic languages (Python/Ruby/JS) weaken tool soundness** — Rename/Move are unsound without
  types. So **exactly where the tools help least, your manual behavior-preservation discipline
  matters MORE.** (Gradual typing — mypy, TypeScript — exists partly to re-enable safe automated
  refactoring; lean on it when present.)
- **Do not do wide reformat / mass rename in the same diff as a substantive change** — isolate
  cosmetic churn in its own commit so the real change isn't buried (a formatter reflow that explodes
  the diff defeats review).
- **Don't trust a "refactor" label / commit message.** ~40% of refactorings aren't even mentioned in
  commit logs (Murphy-Hill); read the actual diff and run tests, and only call your own change a
  refactor if tests are green and behavior is genuinely unchanged.
