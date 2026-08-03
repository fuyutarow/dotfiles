# R&D and language translation — preserve exploration, harden the retained boundary

> **Scope / SOLE declaration:** This is the **SOLE home** for the exploration → trusted kernel
> → production/costly-infrastructure stage model and the Rust/Julia translations. Ledger schema,
> risk admission, and exception validity are owned by `ledger-and-calibration.md`; this file only
> selects stage-appropriate obligations and language-native mechanisms.

## Contents

1. [Stage model](#stage-model)
2. [Minimal exploration floor](#minimal-exploration-floor)
3. [Promotion and demotion](#promotion-and-demotion)
4. [Rust translation](#rust-translation)
5. [Julia translation](#julia-translation)

## Stage model

Use the lightest stage that preserves interpretation and resource control. The stage describes
the retained boundary, never a claim that a language is inherently suitable or unsuitable for
Tiger-inspired work. Fixed line limits, universal recursion bans, and universal post-startup
allocation bans are not translations.

| Stage | Default obligation | Promotion trigger | Evidence artifact | Demotion / reversal |
|---|---|---|---|---|
| Exploration | preserve interpretability; contain cheap waste | a result guides a decision, is shared, runs long/costly, or a candidate kernel/API is selected | run record and rerun | discard the hypothesis and prevent outputs being used as trusted inputs |
| Trusted kernel | stabilize the selected contract and test meaningful negatives | reuse, public/shared API, performance claim, or long-lived experiment dependency | ledger rows, targeted negative check, reproducible run | retire the candidate; retain only the exploration record |
| Production / costly infrastructure | protect durable state, recovery, state transitions, capacity, and residual risk | release, persistent/externally visible effect, or material compute/financial/safety exposure | complete High-tier ledger, independent check/oracle, risk decision | only a named, time-bounded exception may defer a specific obligation |

The R&D objective is useful trial throughput, not ceremonial restriction. Exploration may keep
dynamic representations, recursion, and provisional algorithms where they reveal the hypothesis
better. It must still make an invalid or unrepeatable result distinguishable from a finding.

## Minimal exploration floor

An exploration run records the following before its result is interpreted or compared:

| Floor item | What to record or check | Why it remains even during opt-out |
|---|---|---|
| Identity | seed when stochastic, input/data identity, environment, code revision/commit | enables a meaningful rerun |
| Cheap containment | provisional time, iteration, compute, or cost budget and its overrun action | makes runaway work visible without pretending the research problem is solved |
| Result validity | relevant shape/dimensions, finite values where numerical, and solver/operation status or return code | separates an observed failure from a valid candidate result |
| Interpretation | what outcome may be compared or used, and what anomaly is tagged/quarantined | prevents failed runs from silently entering a conclusion |
| Rerun | one rerun before using the result for a decision | detects obvious non-reproducibility |

The floor is not a production checklist. It does not demand fixed memory layouts, static
abstractions, a predetermined recursion depth, or an assertion quota. If abnormal values are the
object of study, record and tag them rather than discarding them; retain a cost bound and state
that the values are not valid output for another consumer.

## Promotion and demotion

Promotion adds obligations because the meaning or cost of failure changed. It never validates an
old prototype by declaration. Create a promotion artifact that links the selected candidate to
the ledger record and states:

```text
candidate / revision:
stage_from -> stage_to:
contract now relied upon:
negative cases added:
resource / termination observation:
evidence commands and raw loci:
residual risk, owner, review date:
```

At trusted-kernel promotion, freeze the input/output and failure contract sufficiently to test
it, add selected negative cases, and observe termination and allocation if performance matters.
At production promotion, add recovery/capacity/state-transition obligations and an independent
check appropriate to the loss. Demotion records why the candidate is no longer trusted and
prevents its old measurements or outputs from being cited as production evidence.

## Rust translation

Use Rust’s type system to exclude invalid states where practical, and use `Result` for expected
runtime failures. The Rust API Guidelines prefer static enforcement and describe staged runtime
validation; see [C-VALIDATE](https://rust-lang.github.io/api-guidelines/dependability.html).
Types, newtypes, enums, and ownership do not by themselves express protocol order, external
capacity, durability, or all concurrency invariants, so add ledger rows at those boundaries.

| Need | Rust mechanism | Boundary |
|---|---|---|
| Invalid state representable in the API | types, newtypes, enums, constructors that validate | do not recreate type-enforced facts with filler assertions |
| Expected external/runtime failure | `Result` and a caller-visible propagation/retry/compensation policy | do not replace operational failure with `panic!` |
| Internal impossible state | `assert!` or `panic!` with diagnostic context | `assert!` remains enabled in release; use it only when the condition is a programmer invariant ([`assert!`](https://doc.rust-lang.org/stable/core/macro.assert.html), [`panic!`](https://doc.rust-lang.org/stable/core/macro.panic.html)) |
| Unsafe or FFI boundary | narrow contract, targeted tests; Miri where applicable | [Miri](https://github.com/rust-lang/miri) detects classes of undefined behavior but is not complete |
| Lint review | select relevant Clippy lints | the [restriction group is opt-in and intended for selective use](https://doc.rust-lang.org/stable/clippy/usage.html), not a blanket gate |
| Recursive or resource-sensitive work | explicit depth/work/stack or timeout/capacity policy | Rust permits recursion; recursive types require indirection and finite size ([reference](https://doc.rust-lang.org/stable/reference/types.html#recursive-types)) |

For a trusted or production Rust boundary, focus review on type-unexpressed state transitions,
I/O, cancellation, concurrency, persistence, retry/replay, and recovery. A `Result` ignored by a
caller has not been handled; evidence must exercise the chosen operational disposition.

## Julia translation

Keep mathematical notation, multiple dispatch, and changing structures during exploration when
they aid inquiry. Use explicit errors or return/status values for checks that must survive
optimization or protect external inputs: Julia documents that [`@assert`](https://docs.julialang.org/en/v1/base/base/#Base.@assert)
may be disabled at higher optimization levels, so it is debug-only and must not enforce
production input guarantees or carry side effects.

| Need | Julia mechanism and evidence | Boundary |
|---|---|---|
| Numerical result validity | check/record shape, finite values, dimensions/units where represented, seed, and status/return code | an invalid result is tagged, quarantined, or returned as an explicit failure according to the ledger |
| Termination | state a provisional budget in exploration; for solver work inspect the return code and iteration outcome | SciML exposes explicit solution status such as iteration limits ([solution interface](https://docs.sciml.ai/SciMLBase/v2.147/interfaces/Solutions/)); do not infer convergence from an array alone |
| Stable hot kernel | measure type stability and allocations on representative inputs; capture commands/results | Julia recommends function barriers, type-stable code, and measurement-guided preallocation, while warning that excessive preallocation can harm readability ([Performance Tips](https://docs.julialang.org/en/v1/manual/performance-tips/)) |
| Bounds-check removal | state the shape/index invariant and manually verify it before using `@inbounds` | SciML style likewise requires manual validation when bypassing checks ([SciML Style](https://docs.sciml.ai/SciMLStyle/)) |
| Regression boundary | targeted `Test.@test` cases for chosen contracts and negatives | the standard [Test library](https://docs.julialang.org/en/v1/stdlib/Test/) supplies the mechanism, not the choice of invariant |

`@assert` may still document a development-time internal invariant, but it is not a substitute
for an error/return-code contract. Allocation measurement is an observation, not a mandate to
preallocate everything: retain flexible allocation while candidate shape and algorithm remain
unknown, then harden only selected hot paths or explicit capacity-constrained deployments.

Both language translations preserve the same cross-language distinction: a programmer error can
fail fast; an operational error needs visible propagation or recovery; an expected experimental
failure is recorded under its protocol. The governing definitions and PASS/STOP decision remain
in `ledger-and-calibration.md`.
