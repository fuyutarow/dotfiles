---
name: verifying-symbolic-identities
description: >-
  Verifies algebraic identities and equalities with exact computer algebra, and labels every result
  by the rung it actually reached. MANDATORY before calling an identity, simplification or 検算
  "symbolic", and before reporting random-point or numeric checks as verification. Use for 記号検算,
  記号的に確認, 恒等式の検証, 論文の式の検算, exact zero test, canonical/normal form, rational-function
  identities, minimal polynomials, algebraic numbers, Nemo, AbstractAlgebra, QQBarField,
  CalciumField, Oscar, Symbolics/SymPy/SymEngine simplify, Groebner normal forms, Schwartz–Zippel,
  乱数点での検算. Cuts: Julia package and code mechanics, Symbolics codegen → writing-julia;
  kernel-checked proof and statement faithfulness → proving-theorems; numeric baseline comparability
  → validating-experimental-evidence. Workflow-native: rung choice and labels stay SOLO;
  independent identities may fan out. English skill; respond in the user's language.
---

# Verifying symbolic identities — rung, receipt, no silent downgrade

> **Version**: v2610.1.0 (2026-10-03) — initial forge, split out of writing-julia `packages.md`.
> **History and source grades**: `tests/forge-verification-ledger.md`. Dated tool facts: `references/sources.md`.

```bash
test -f references/rungs-and-tools.md || exit 1; test -f references/sources.md || echo MISSING sources; test -f tests/trigger-set.md || echo MISSING trigger-set; test -f tests/forge-verification-ledger.md || echo MISSING ledger
```

## Language

English skill; respond in the user's language (default Japanese). Keep these tokens fixed inside
Japanese prose: **RUNG** (R1–R5), **RECEIPT**, **canonical**, **normal**, **SILENT DOWNGRADE**,
**UNDECIDED**, **side condition**.

## THE LAW

> An identity is verified to the rung its method reached, and the label says that rung. Only R1
> (kernel proof) and R2 (exact canonical or normal form decides zero) may be called "symbolic" or
> 記号的. Exact random points (R3) are probabilistic evidence; a heuristic simplify (R4) and floats
> (R5) prove nothing. A method the user named is kept, or its infeasibility is reported BEFORE any
> substitute runs. Every claim ships a RECEIPT.

## The gates — VS0–VS4, each with a checkable artifact

| Gate | Rule | Artifact |
|---|---|---|
| **VS0 METHOD FIDELITY** | The requested method stays. A weaker substitute runs only after the infeasibility is reported. | RECEIPT fields `requested` and `used`; a mismatch has its reported reason. |
| **VS1 DOMAIN** | Name the algebraic domain before choosing a tool (§1). | RECEIPT field `domain`: ring or field, coefficient field, generators. |
| **VS2 RUNG** | Take the highest feasible rung from §1. Record what blocked the higher one. | RECEIPT field `rung` and, below R2, `blocked_by`. |
| **VS3 SIDE CONDITIONS** | List every assumption the method used: nonzero denominators, branch choices, positivity. | RECEIPT field `side_conditions`; empty only if none were used. |
| **VS4 RECEIPT** | Write the RECEIPT (§3) per identity before any report sentence uses its result. | One RECEIPT block per identity, in the report or its record. |

## Routing — sibling cuts (typed, runtime-answerable)

| Sibling | Cut |
|---|---|
| `writing-julia` | **PURPOSE:** is the ask whether an identity HOLDS? Yes → HERE. Package choice for building or generating code, Symbolics/ModelingToolkit codegen, `lambdify` to AD, environments and TTFX → there. Co-fire: writing-julia's JG gates govern any Julia this skill writes. |
| `proving-theorems` | **PURPOSE:** R1 certification, statement faithfulness and the `sorry` ledger → there. Choosing R2–R5, running the CAS, finding a witness (cofactors for `linear_combination`) → HERE. A CAS result is an untrusted oracle until a kernel replays it. |
| `validating-experimental-evidence` | **DECISIVE:** an equality of mathematical expressions → HERE. Whether a measured number matches a baseline → there. |
| `systematizing-knowledge` | **PURPOSE:** surveying CAS tools or the identity-testing literature → there. Checking a specific identity → HERE. |
| `orchestrating-agents` | **CARDINALITY:** VS0 governs this skill's method choice. Method fidelity across delegated briefs in general → there. |

## MUST NOT FIRE

| Ask | Route |
|---|---|
| 「Symbolics で ODE を組んで build_function したい」 | `writing-julia` (codegen, not verification) |
| "Formalize this identity in Lean and close it with `ring`" | `proving-theorems` |
| 「この数値結果はベースラインと比べて妥当?」 | `validating-experimental-evidence` |
| "Which Julia CAS packages exist? Survey them" | `systematizing-knowledge` |
| "SymEngine の `lambdify` が AD で MethodError" | `writing-julia` |

The full set, with fire and co-fire rows: `tests/trigger-set.md`. Desk-check it after any
description edit.

---

## §1 Rung and tool choice (SOLE home)

| Rung | Method | What it establishes | Label |
|---|---|---|---|
| **R1** | Kernel proof: Lean `ring`, `field`, `linear_combination`; Rocq `ring`, `field` | Certified, given a faithful statement | `proved (kernel)` → via `proving-theorems` |
| **R2** | Exact canonical or normal form: difference reduces to 0 in an exact domain | Decided, trusting the CAS implementation | `verified (exact CAS, <tool>)` |
| **R3** | Exact evaluation at random points over Q or a prime field | Probabilistic evidence, bounded by Schwartz or DeMillo–Lipton | `evidence (R3, <points>, bound <b>)` |
| **R4** | Heuristic simplify reaching 0 | Nothing beyond R3-like plausibility; failure to reach 0 shows nothing | `heuristic (R4)` |
| **R5** | Floating-point comparison with tolerance | Plausibility only | `numeric (R5)` |

Pick the tool by the domain (VS1):

| Domain of the identity | R2 tool | If R2 is blocked |
|---|---|---|
| Polynomials or rational functions over Q or Z | AbstractAlgebra or Nemo: fraction field of the polynomial ring; `iszero(lhs - rhs)` | Nothing blocks R2 here; never drop to R3 |
| Algebraic numbers (radicals, roots of unity) | Nemo `QQBarField`: exact `==` on canonical minimal-polynomial form | Number field via Nemo/Hecke if the degree is large |
| Polynomial identity under polynomial hypotheses | Groebner.jl `normalform` with `certify=true` on a homogeneous ideal | Non-homogeneous: R3 label, or witness to R1 via `linear_combination` |
| exp, log, trig, other transcendentals | Nemo `CalciumField`: `==` decides or throws | A throw is UNDECIDED; record it, then R3 at random points |
| Symbolic expression trees already in Symbolics or SymPy | Convert to a polynomial or fraction-field element, then R2 | R4 at most; never "symbolic" |

Load only AbstractAlgebra or Nemo for R2. Oscar is not needed for identity checks.
Detail, code shapes and failure modes: `references/rungs-and-tools.md`.

## §2 Deny-list (SILENT DOWNGRADE and its cousins)

| Never | Instead |
|---|---|
| Call an R3, R4 or R5 result "symbolic", "記号的", or "verified" | Use the §1 label of the rung reached |
| Verify equality by numeric substitution with a tolerance and report it as an identity check | R2 in the exact domain; R5 only as a labelled smoke test |
| Swap a requested method for a weaker one without saying so first | Report the blocker (VS0), then run the substitute under its own label |
| Treat SymPy `==` or Symbolics `isequal` as mathematical equality | They compare structure; use R2 |
| Read `simplify(expr) != 0` as a disproof | Search for a counterexample at exact points instead |
| Trust Groebner.jl defaults as certified | The default is probabilistic; `certify=true` covers homogeneous ideals only |
| Use AlgebraicNumbers.jl for equality | Its `==` falls back to numeric root comparison; use `QQBarField` |
| Divide out a factor without recording its nonzero condition | List it under VS3 |

## §3 RECEIPT (SOLE home of the format)

```text
identity:        <lhs> = <rhs>   (source locus)
domain:          <ring/field, coefficients, generators>
requested:       <method the user or brief named, or "none">
used:            <method actually run>
rung:            R1 | R2 | R3 | R4 | R5 | UNDECIDED
blocked_by:      <why no higher rung; empty at R1/R2>
side_conditions: <nonzero denominators, branches, assumptions; or "none">
tool:            <package and version, or proof assistant and commit>
result:          holds | fails (counterexample) | undecided (<exception>)
R3 only:         field, point set size |S|, total degree bound d, trials t, miss bound
```

A failing identity reports the counterexample point. An UNDECIDED result never becomes "holds".

## §4 R3 bound — how to state it

| Situation | Bound to quote |
|---|---|
| Nonzero polynomial, total degree ≤ d, points drawn from a finite set S per coordinate | miss probability ≤ d/\|S\| per trial; ≤ (d/\|S\|)^t for t independent trials |
| Rational-function identity | Clear denominators first; d is the degree of the cleared numerator; reject points where a denominator vanishes |
| Unknown degree | No bound. Label `evidence (R3, degree unknown)` |

The quoted form is the corpus's restatement. Schwartz prints a per-variable sum and a counting
corollary, not d/\|S\| verbatim (`references/sources.md`).

## Execution model — solo by default

The modal case is ONE identity or a handful: SOLO, zero agents. A paper with many independent
identities may fan out one verifier per identity. Each returns a RECEIPT, not a verdict sentence.
Rung choice, labels and the final report stay SOLO with the editor, who re-reads every RECEIPT.
No harness → the same map, serial. If a constraint here feels unnecessary, that feeling is the
failure mode — follow the map.

## Reference index — load the file you need

| File | Covers | Read when |
|---|---|---|
| `references/rungs-and-tools.md` | Code shapes per R2 tool, Calcium exceptions, Groebner `certify`, witnesses for `linear_combination`, R3 sampling | before running any check |
| `references/sources.md` | Dated versions and guarantees per tool, primary sources, unverified items [dated:2026-10] | quoting a version or a guarantee; rechecking after two quarters |
