# catalog.md — smells as triggers, the named moves, the depth test

> WHAT transformation, and when each fires. The smell is the *prompt to look*; the named refactoring
> is the *move*. The coupling/cohesion/connascence *reading* of a smell and the deny-gate live in
> `architecture.md` — this file is the trigger→move map and the mechanics. Provenance: Fowler
> catalog (2e), Beck tidyings, Kerievsky *Refactoring to Patterns*.

## 1. Smells are triggers, not work orders

A smell is **a prompt to LOOK, not a mandate to change** (SMELL ≠ EDIT, see `architecture.md` §6).
Most smells are, underneath, **excess coupling or missing cohesion** — classify which before
choosing a move, because opposite smells push opposite ways (see §3). The catalog below maps a
detectable trigger → the move(s) it points to. An agent can grep/read for most triggers.

| Smell (trigger) | What to detect | Points to |
|---|---|---|
| **Mysterious Name** | a name that doesn't say what it does | Change Function Declaration / Rename (G4) |
| **Duplicated Code** | same *knowledge* twice (not coincidental) | Extract Function; but Rule of Three + AHA first (`strategy.md`) |
| **Long Function** | does >1 thing / needs a section comment (**NOT line count**) | Extract Function (by depth, §4); Decompose Conditional; Compose Method |
| **Long Parameter List** | many params, or a flag param | Introduce Parameter Object; Preserve Whole Object; Remove Flag Argument |
| **Global / Mutable Data** | shared mutable state, singletons | Encapsulate Variable/Record (common-coupling fix) |
| **Divergent Change** | one module changes for many reasons | Split by responsibility (cohesion — `architecture.md` §2) |
| **Shotgun Surgery** | one change edits many modules | Move Function/Field to gather (coupling — `architecture.md` §2) |
| **Feature Envy** | a method uses another module's data more than its own | Move Function to the data |
| **Data Clumps** | the same fields travel together | Extract Class / Introduce Parameter Object |
| **Primitive Obsession** | primitives encoding a domain concept | Replace Primitive with Object; Replace Type Code with Subclasses |
| **Repeated Switches** | the same switch on a type code in many places | Replace Conditional with Polymorphism |
| **Flag Argument** | `f(true)` you can't read at the call site | Remove Flag Argument → named functions (control-coupling fix) |
| **Nested Conditional** | deep if/else, arrow code | Replace Nested Conditional with Guard Clauses; Decompose Conditional |
| **Message Chains** | `a.b().c().d()` | Hide Delegate (but watch the Middle Man dual) |
| **Middle Man** | a class that only delegates | Inline / Remove Middle Man (the dual of Hide Delegate) |
| **Speculative Generality** | unused hook/param/abstract base with one subclass | Collapse Hierarchy / Inline / Remove Dead Code (removal passes the gate) |
| **Large Class / God Class** | too many responsibilities/actors | Extract Class **on the actor line** (SRP, `architecture.md` §3) |
| **Data Class** | fields + getters, no behavior | Move behavior in (Feature Envy from callers) |
| **Comments (as deodorant)** | a WHAT-comment masking tangled code | fix the code (Extract/Rename), THEN the comment is redundant — **keep WHY-comments** |

## 2. The common shape — every named move shares it

All catalog refactorings share one shape; internalize the shape, not 100 names:

1. **Tiny, reversible, named** — each step compiles + passes tests and can be reverted alone.
2. **Paired** — Extract⇄Inline, Hide Delegate⇄Remove Middle Man, Pull Up⇄Push Down. **Over-applying
   one direction is itself a smell** (over-extraction → Lazy Element / Middle Man).
3. **Precondition-carrying** (Opdyke) — reference completeness, no name capture/collision, local
   data-flow, control-flow not crossing the extraction boundary, side-effect ordering preserved. An
   IDE checks these statically; **you edit text, so verify them by hand or delegate to a tool**
   (`safety-net.md`).

High-value moves to know (trigger → mechanics, terse):

- **Extract / Inline Function** — extract when it passes the depth test (§4); inline when the body is
  as clear as the name (over-extraction reversal).
- **Change Function Declaration** (Rename / reorder / add-remove param) — use symbol-aware tooling; on
  a published interface use Parallel Change (`strategy.md`).
- **Move Function / Field** — to the module that uses it most (fixes Feature Envy / Shotgun Surgery).
- **Extract / Inline Variable** (a.k.a. explaining variable) — name a sub-expression.
- **Encapsulate Variable / Record / Collection** — put a single guarded home around data (common-coupling fix).
- **Replace Conditional with Polymorphism** — for Repeated Switches on a type code (only when the
  variant proliferation is REAL — not a single two-branch `if`).
- **Decompose / Consolidate Conditional**, **Replace Nested Conditional with Guard Clauses** — flatten branching.
- **Introduce Parameter Object / Preserve Whole Object** — for Data Clumps / stamp-coupling (narrow
  vs widen deliberately, `architecture.md` §2).
- **Remove Flag Argument**, **Separate Query from Modifier** (command-query separation), **Split Phase**.
- **Pull Up / Push Down**, **Extract Superclass**, **Replace Inheritance with Delegation**, **Collapse Hierarchy**.

## 3. Coupling vs cohesion — pick the direction before the move

Divergent Change (cohesion missing) and Shotgun Surgery (coupling excess) are **opposite failures
whose fixes push in opposite directions**; likewise Message Chains vs Middle Man. **Classify the
smell as coupling or cohesion first** (`architecture.md` §2), then pick the move — applying the wrong
direction makes it worse (e.g. Hide Delegate everywhere manufactures Middle Man). Ground the
classification in the ACTUAL code: read the target AND its callers, and inspect `git log` co-change
before deciding where code belongs — Feature Envy / Shotgun Surgery / Divergent Change are only
visible once you see who uses what.

## 4. The depth test — extract iff the module is DEEP

Extraction's trigger is **module depth** (Ousterhout: hidden implementation-complexity /
exposed interface-complexity), **never line count**:

> **Extract ONLY if** the new name + signature lets a caller **skip reading the body**, OR the
> fragment is duplicated / needs an independent test seam / hides a leak-prone detail.
> **Keep it inline if** it has a single caller who must still know the body's internals to use it
> correctly (shared state, ordering constraints, preconditions to re-explain), or the abstraction
> leaks so the caller opens the body anyway.

The mirror move: a long inline block **must** be extracted the moment it is duplicated, needs an
independent test seam, or acquires a name that lets every caller skip its body — even if short.
**Do not shred a coherent linear narrative into a swarm of one-line helpers** (Clean-Code
tiny-function dogma is churn — `architecture.md` §6, `strategy.md`). Drive toward Beck's Simple
Design **in priority order**: (1) passes tests, (2) reveals intention, (3) no duplication, (4) fewest
elements — never sacrifice a higher rule for a lower (do not dedup in a way that obscures intent).

## 5. Kerievsky — refactor toward AND away from patterns

Refactor **to** a Gang-of-Four pattern only when a **smell justifies it** (Replace Conditional Logic
with Strategy; Form Template Method; Move Embellishment to Decorator; Replace Type Code with
State/Strategy; Introduce Null Object; **Compose Method** = the canonical answer to Long Function).
Equally, refactor **away** from an **over-applied** pattern — patterns can be over-engineering.
Pattern **removal passes the deny-gate** (`smell removed: Speculative Generality`). **Never
pattern-cargo-cult**: a Strategy with one strategy, a Factory with one product, an interface with one
implementation are Speculative Generality, not architecture (`architecture.md` §6 over-refactor check).
