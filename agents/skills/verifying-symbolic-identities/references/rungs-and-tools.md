# Rungs and tools — how to run each check

The rung table and the tool-by-domain table live in `SKILL.md` §1 (SOLE home). This file holds the
code shapes and the failure modes behind them. API names were read from docs dated in
`sources.md`; confirm a signature with `?name` in the REPL before relying on it.

## R2.1 Rational-function identities — fraction field (the default case)

Build both sides directly in the exact ring. Do not build them in Symbolics and convert.

```julia
using AbstractAlgebra            # or: using Nemo (same interface, FLINT-backed)
R, (x, y) = polynomial_ring(QQ, [:x, :y])
F = fraction_field(R)
lhs = F(x^2 - y^2) // F(x - y)
rhs = F(x + y)
iszero(lhs - rhs)                # true decides the identity in Q(x, y)
```

| Fact the check relies on | Consequence |
|---|---|
| Fractions are equal iff ad = bc; results are reduced by gcd and `canonical_unit` | `iszero(lhs - rhs)` decides equality of rational functions |
| The identity holds in Q(x, y), not pointwise | Record every denominator under VS3 as `≠ 0` |
| Coefficients are exact rationals | Never seed with `Float64` literals; write `1//3`, not `0.333` |

## R2.2 Algebraic numbers — QQBarField

```julia
using Nemo
K = algebraic_closure(QQ)        # QQBarField
a = sqrt(K(3)) + sqrt(K(-1))
a^4 - 4*a^2 + 16 == 0            # exact ==; decides
```

| Fact | Consequence |
|---|---|
| Elements are stored as the reduced minimal polynomial plus an isolating enclosure | `==` is exact and decides |
| Degree grows with every operation | Very high degree is slow; switch to a number field of known degree |
| The name `QQBar` is a deprecated binding | Write `algebraic_closure(QQ)` or `QQBarField()` |

## R2.3 Transcendental constants — CalciumField

```julia
using Nemo
C = CalciumField()
lhs, rhs = C(...), C(...)       # build both sides from exact constants
try
    lhs == rhs                   # true or false only when FLINT can prove it
catch err
    # UNDECIDED: record err; do not report "holds"
end
```

| Fact | Consequence |
|---|---|
| The representation is not canonical in general | A zero test can fail to decide |
| When FLINT cannot decide, Nemo throws | Catch it; the RECEIPT says `UNDECIDED (<exception>)` |
| Over algebraic numbers the test is complete | Prefer QQBarField when no transcendental appears |
| General zero-equivalence with sin and abs is undecidable | An UNDECIDED result is expected, not a bug |

Identities with free variables and transcendental functions (e.g. trig identities in x) are not
decided by CalciumField. Rewrite trig in exp form and use a polynomial ring in exp(ix) when the
identity is polynomial in those exponentials. Otherwise take R3 and say so.

## R2.4 Identities under hypotheses — ideal membership

The claim "f = 0 whenever h₁ = … = hₖ = 0" is ideal membership (or radical membership).

| Step | Tool | Caveat |
|---|---|---|
| Groebner basis of (h₁, …, hₖ) | Groebner.jl `groebner(hs; certify=true)` | `certify` guarantees correctness only for homogeneous ideals |
| Reduce f | `normalform(G, f)` | Default mode is probabilistic with no known bound |
| Result 0 | f is in the ideal | Non-homogeneous without certification: label R3-like evidence |
| Kernel proof | Lean `linear_combination c₁ * h₁ + …` | Needs explicit cofactors cᵢ; hand them to `proving-theorems` |

Radical membership (f vanishes on the variety but is not in the ideal) needs the Rabinowitsch trick
or a power of f. Say which question was asked.

## R3 Exact random points

| Choice | Rule |
|---|---|
| Field | `Rational{BigInt}` points, or a prime field GF(p) with p > 10⁹ |
| Point set S | Draw each coordinate uniformly from a finite S; record \|S\| |
| Degree d | Total degree of the polynomial tested; for fractions, of the cleared numerator |
| Trials t | Independent draws; miss bound (d/\|S\|)^t |
| Denominators | Reject points where any denominator vanishes; count rejections |
| Failure | One nonzero point disproves the identity; report that point |

R3 is the right tool to FIND counterexamples fast, before R2. It never replaces R2 when R2 applies.

## R4 Heuristic simplifiers

| Tool | What its docs say | Use |
|---|---|---|
| Symbolics `simplify` | Assumes denominators nonzero; no canonical-form claim | Exploration; label R4 |
| SymPy `simplify` | Uses heuristics; "simplest" is not well defined | Exploration; label R4 |
| SymPy `equals` | Returns True, False, or None; mixes simplify and numeric checks | None is UNDECIDED |
| SymEngine | `expand` and structural `==`; no general simplify | Exploration; label R4 |

A SymEngine `expand(lhs - rhs) == 0` is not recorded as R2: the captured docs show only structural
equality. Redo the check in AbstractAlgebra for an R2 label.

## R1 Handing to a kernel

| CAS output | Lean tactic | Note |
|---|---|---|
| Polynomial identity, no hypotheses | `ring` | Normalises both sides; no division |
| Rational identity | `field_simp` then `ring`, or `field` | Nonzero denominators must be discharged or assumed |
| Identity under hypotheses with cofactors | `linear_combination` | Cofactors come from the CAS |

The statement's faithfulness and the final label belong to `proving-theorems`.
