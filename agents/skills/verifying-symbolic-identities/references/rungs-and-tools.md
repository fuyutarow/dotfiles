# Rungs and tools — how to run each check

The rung table and the domain-to-route table live in `SKILL.md` §1 (SOLE home). This file holds
code shapes and failure modes. Names marked (docs) appear in the captured docs (`sources.md`).
Names marked (unchecked) were not in the capture; run `?name` in the REPL before relying on them.

## R2.1 Rational functions over Q — the default route

Build both sides directly in the exact ring. Do not build them in Symbolics and convert.

```julia
using Pkg; Pkg.activate(; temp = true); Pkg.add("AbstractAlgebra")   # only if not installed
using AbstractAlgebra
R, (x, y) = polynomial_ring(QQ, [:x, :y])      # (unchecked) multivariate signature
F = fraction_field(R)                          # (unchecked)
lhs = F(x^2 - y^2) // F(x - y)                 # `//` (docs)
rhs = F(x + y)
iszero(lhs - rhs)                              # zero numerator decides the identity in Q(x, y)
```

| Situation | Action |
|---|---|
| Both sides are fractions a/b and c/d | Equivalent check without gcd: `a*d - b*c == 0` in the polynomial ring |
| Any denominator appears | Add `<denominator> ≠ 0` to side_conditions |
| A literal like `0.333` appears | Rewrite it as `1//3`; a float coefficient makes the check R5 |
| The check runs past the time limit | `undecided (timeout)`; then R3 with the bound from SKILL.md §4 |

The captured Nemo docs state fraction equality as ad = bc (`sources.md`). Multivariate gcd
behaviour was not in the capture; the cross-multiplication form avoids depending on it.

## R2.2 Algebraic constants — QQBarField

```julia
using Nemo
K = algebraic_closure(QQ)                      # QQBarField (docs)
a = sqrt(K(3)) + sqrt(K(-1))                   # sqrt (docs); principal branches
a^4 - 4*a^2 + 16 == 0                          # exact `==` (docs)
```

| Fact | Action |
|---|---|
| `==` is exact on the canonical minimal-polynomial form | Label R2 |
| `sqrt` returns the principal root | side_conditions: principal branches |
| Degree grows with each operation | Very high degree is slow; use a number field of known degree |
| `QQBar` is a deprecated binding | Write `algebraic_closure(QQ)` |

## R2.3 Transcendentals

Constants (no free variable):

```julia
using Nemo
C = CalciumField()                             # (docs)
lhs, rhs = C(...), C(...)                      # build both sides from exact constants
try
    lhs == rhs                                 # true or false only when FLINT can prove it
catch err
    # UNDECIDED: record err; never report "holds"
end
```

| Fact | Action |
|---|---|
| The representation is not canonical in general; `==` throws when undecided | A throw → UNDECIDED |
| The Calcium paper's algorithm is complete over algebraic numbers | Nemo's docs do not promise it; default limits (e.g. `qqbar_deg_limit`) can still throw |
| Algebraic constants only | Prefer QQBarField for its canonical form |
| Zero-equivalence with sin and abs is undecidable in general | UNDECIDED is an expected outcome |

Free variable (derived route, not from the capture). Use it when both sides are polynomials in
sin x, cos x and exp(±ix). Substitute z = exp(ix), sin x = (z − 1/z)/(2i), cos x = (z + 1/z)/2. Test in the fraction
field of Q(i)[z]. A separate free x beside sin x is a separate generator. Record the route in `used`.
Anything not polynomial in exp(ix) → R3, with `blocked_by: not polynomial in exp(ix)`.

## R2.4 Identities under polynomial hypotheses — Groebner bases

The claim "f = 0 whenever h₁ = … = hₖ = 0" is ideal membership, or radical membership.

| Call | Guarantee as documented | Label |
|---|---|---|
| `groebner(hs; certify=true)` (docs) | correct when the ideal is homogeneous | R2 if all hᵢ are homogeneous |
| `groebner(hs)` default (docs) | probabilistic; no precise bound known | R3u |
| `normalform(G, f)` (docs) | reduces f by the basis G | 0 → f is in the ideal, at G's rung |
| Default `seed` | fixed; reruns are not independent | count reruns as one trial |
| Cofactors cᵢ with f = Σ cᵢhᵢ | not from the capture; compute separately | hand to R1 `linear_combination` |

Radical membership (f vanishes on the variety but is not in the ideal) needs a power of f or the
Rabinowitsch trick. Say which question was asked.

## R2.5 Algebraic functions of a free variable

Introduce a generator for each radical with its defining relation, then decide ideal membership.

| Example claim | Route | Result |
|---|---|---|
| sqrt(x²) = x | Generator s, relation s² − x² = 0; is s − x in (s² − x²)? No | `fails (x = −1)` on R; `holds under x ≥ 0, principal branch` |
| sqrt(x)·sqrt(x) = x | s² − x = 0; is s² − x in the ideal? Yes | `holds` (no branch needed) |

The CAS decides membership. It does not decide which branch the paper meant. Take the domain the
paper states; if it states none, test the widest one and report the condition under which it holds.

## R3 Exact random points

| Choice | Rule |
|---|---|
| Arithmetic | `Rational{BigInt}`; never Float64 (that is R5) |
| Radicals with no exact rational value | R3 does not apply; use R2.5 |
| Point set S | Each coordinate uniform on a finite S with \|S\| > d; record \|S\| |
| Domain | Cover the whole claimed domain: negative values, and complex points if the claim allows them |
| Denominators | Reject points where any denominator vanishes; count rejections; use the §4 rational bound |
| Prime field | Only with p drawn at random or checked against coefficients and denominators |
| Failure | One nonzero point disproves the identity; report that point |

## R4 Heuristic tools

| Tool | What its docs say | Label |
|---|---|---|
| Symbolics `simplify` | assumes denominators are not zero | R4; add those side conditions |
| Symbolics `isequal` | no equality guarantee documented | not evidence |
| SymPy `simplify` | uses heuristics; "simplest" is not well defined | R4 |
| Python SymPy `==` | structural equality | not evidence |
| SymPy `equals` | True, False or None | None → UNDECIDED; True → R4 |
| SymPy.jl `==` | calls `equals`; falls back to a hash comparison when undecided | not evidence |
| SymEngine `expand`, `==` | no simplification or equality guarantee documented | R4 at most |

## R1 Handing to a kernel

| CAS output | Lean tactic | Note |
|---|---|---|
| Polynomial identity, no hypotheses | `ring` | No division |
| Rational identity | `field_simp` then `ring`, or `field` | Nonzero denominators must be discharged or assumed |
| Identity under hypotheses with cofactors | `linear_combination` | Cofactors come from the CAS |

Statement faithfulness and the `certified` label belong to `proving-theorems`.
