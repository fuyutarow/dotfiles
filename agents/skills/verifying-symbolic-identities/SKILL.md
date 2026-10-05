---
name: verifying-symbolic-identities
description: >-
  Verifies whether an algebraic or transcendental identity holds, with exact computer algebra, and
  labels every result by the rung it reached. Use when someone asks for symbolic/記号的, exact/厳密 or
  CAS checking of a formula, or reports random-point or numeric checks as verification. MANDATORY
  before calling an identity, simplification or 検算 "symbolic". Use for 記号検算, 恒等式の検証, 論文の式の検算,
  exact zero test/ゼロ判定, canonical/normal form/正準形, minimal polynomial/最小多項式, algebraic
  numbers/代数的数, 超越関数の厳密判定, Nemo/AbstractAlgebra/QQBarField/CalciumField as the deciding
  engine, Symbolics/SymPy simplify, SymEngine expand, Groebner normal forms, Schwartz–Zippel,
  乱数点での検算. PURPOSE cuts: Julia code, packages, install/TTFX, Symbolics codegen → writing-julia;
  kernel proof and statement faithfulness → proving-theorems; CAS-tool surveys →
  systematizing-knowledge; a paper's argument → arguing-research-papers. English skill; respond in the
  user's language (default Japanese).
---

# Verifying symbolic identities — rung, receipt, no silent downgrade

> **Version**: v2610.1.0 (2026-10-03) — initial forge, split out of writing-julia `packages.md`.
> **History and source grades**: `tests/forge-verification-ledger.md`. Dated tool facts: `references/sources.md`.

```bash
test -f references/rungs-and-tools.md || exit 1; test -f references/sources.md || echo MISSING sources; test -f tests/trigger-set.md || echo MISSING trigger-set; test -f tests/forge-verification-ledger.md || echo MISSING ledger
```

## Language

English skill; respond in the user's language (default Japanese). Keep these tokens fixed inside
Japanese prose. Rungs: **R1**, **R2**, **R3**, **R3u**, **R4**, **R5**. Terms: **RECEIPT**, **canonical**,
**normal**, **SILENT DOWNGRADE**, **UNDECIDED**, **side condition**.

## THE LAW

> An identity is verified to the rung its method reached, and the label says that rung. Only R1
> and R2 may be called "symbolic", 記号的 or 記号検算. A request worded symbolic or exact demands R2
> or higher. A lower rung runs only after the blocker is reported, and under its own label. Every
> claim ships a RECEIPT with the evidence that decided it.

## The gates — VS0–VS4, each with a checkable artifact

| Gate | Rule | Artifact |
|---|---|---|
| **VS0 METHOD FIDELITY** | Map the request to a required rung (§0). A lower rung runs only after the blocker is reported. | RECEIPT `requested` and `used`; a mismatch carries `blocked_by` and the report sentence that disclosed it. |
| **VS1 DOMAIN** | Name the domain of the claim before choosing a tool (§1). | RECEIPT `domain`: ring or field, generators, relations, the variable range claimed. |
| **VS2 RUNG** | Target R2 by default. Target R1 only when asked or when `proving-theorems` co-fires. | RECEIPT `rung`; below the target, `blocked_by`. |
| **VS3 SIDE CONDITIONS** | Every denominator d records `d ≠ 0`. Every root or log records its branch. Every assumption a tool made is listed. | RECEIPT `side_conditions`; "none" only when no denominator, branch or assumption occurs. |
| **VS4 RECEIPT** | Write the RECEIPT (§3) before any report sentence uses the result. | RECEIPT rows plus a rung summary line; `evidence` names the script and the output that decided it. |

## §0 Request → required rung (VS0 lookup)

| The request says | `requested` | If the required rung is blocked |
|---|---|---|
| Lean, Rocq, 証明, formal proof | R1 | Co-fire `proving-theorems`; report and stop at R2 |
| 記号, 記号的, 記号検算, symbolic, 厳密, exact, 代数的, CAS, 恒等式として | R2 | Report the blocker first, then run R3 under the R3 label |
| 乱数点, random points, Schwartz–Zippel | R3 | Run it; never relabel upward |
| 数値, numerical, approx, isapprox | R5 | Run it; label R5 |
| None of these words | none | Target R2 anyway (VS2) |

| Blocker | Action |
|---|---|
| R2 package not in the active environment | Install into a temporary environment (`Pkg.activate(; temp = true)`), never the user's project |
| Temporary install fails | `blocked_by: tool unavailable`; report; continue only under the lower label |
| An R2 attempt exceeds the time limit (state it; default 300 s) | `result: undecided (timeout)`; then R3 with its label |
| Running inside a delegated brief with no user to ask | Put the blocker in the returned result; do not wait; never use the requested label |

## Routing — sibling cuts (typed, runtime-answerable)

| Sibling | Cut |
|---|---|
| `writing-julia` | **PURPOSE:** does the ask decide whether an identity HOLDS? Yes → HERE, including which exact-CAS tool decides it. Code, packages for building or generating code, install and TTFX, Symbolics codegen, `lambdify` to AD → there. Its JG gates govern any Julia this skill writes. |
| `proving-theorems` | **PURPOSE:** R1 certification, statement faithfulness and the `sorry` ledger → there. Choosing R2–R5, running the CAS, finding witnesses (cofactors for `linear_combination`) → HERE. A CAS result is an untrusted oracle until a kernel replays it. |
| `implementing-and-debugging` | **Co-fire:** a new or broken checking script goes through its BUILD/DEBUG gate first. |
| `validating-experimental-evidence` | **DECISIVE:** equality of mathematical expressions → HERE. A measured number against a baseline → there. |
| `systematizing-knowledge` | **PURPOSE:** surveying CAS tools or the identity-testing literature → there. Checking a specific identity → HERE. |
| `arguing-research-papers` | **PURPOSE:** whether a paper's argument or claim stands → there. Whether its equation (n) holds → HERE. |
| `systematizing-theories` | **Co-fire:** an identity inside a theory map → HERE for R2, then `proving-theorems` for R1, then the theory owner records it. |
| `orchestrating-agents` | **CARDINALITY:** dispatch and briefs for many verifiers → there. §0 still binds each verifier. |

## MUST NOT FIRE (representative rows; the full set is `tests/trigger-set.md`)

| Ask | Route |
|---|---|
| 「Symbolics で ODE を組んで build_function したい」 | `writing-julia` |
| "Formalize this identity in Lean and close it with `ring`" | `proving-theorems` |
| 「Oscar の install が遅い、precompile を速くしたい」 | `writing-julia` |
| "Survey the Julia computer-algebra ecosystem" | `systematizing-knowledge` |

---

## §1 Rung and tool choice (SOLE home)

| Rung | Method | What it establishes | Label (EN / JA) |
|---|---|---|---|
| **R1** | Kernel proof: Lean `ring`, `field`, `linear_combination`; Rocq `ring`, `field` | Certified, given a faithful statement | `certified (kernel)` / 証明済み(カーネル) |
| **R2** | Exact decision: canonical or normal form reduces the difference to 0, or a proving zero test that throws when undecided | Decided, trusting the CAS implementation | `verified (exact CAS, <tool>)` / 記号検算済み(<tool>) |
| **R3** | Exact evaluation at random points with a stated bound (§4) | Evidence: false-accept probability ≤ the bound | `evidence (R3, bound <b>)` / 乱数点での厳密評価(確率的、上界 <b>) |
| **R3u** | Probabilistic method with no known bound (e.g. default Groebner.jl) | Evidence without a number | `evidence (probabilistic, no bound)` / 確率的な確認(上界なし) |
| **R4** | Heuristic simplify reaching 0 | Holds only under the tool's recorded assumptions; failure to reach 0 shows nothing | `heuristic (R4)` / 発見的な簡約 |
| **R5** | Floating-point comparison with tolerance | Plausibility only | `numeric (R5)` / 数値での確認 |

Pick the tool by the domain (VS1):

| Domain of the claim | R2 route | If R2 is blocked |
|---|---|---|
| Polynomials or rational functions over Q | Fraction field of the polynomial ring; `iszero(lhs - rhs)`, or `a*d - b*c == 0` in the ring | Expression swell (timeout) → R3 with bound |
| Constants built from radicals or roots of unity | `QQBarField` exact `==` | Number field of known degree |
| Constants with exp, log, π, trig | `CalciumField` `==`; a throw is UNDECIDED | No variables, so no R3; report UNDECIDED, optionally with R5 at high precision |
| Trig or exp of a free variable, polynomial in exp(ix) | Substitute z = exp(ix); test in the polynomial ring over Q(i) (derived route, `references/rungs-and-tools.md` R2.3) | R3 with bound |
| Algebraic functions of a free variable (sqrt, roots) | Add a generator with its defining relation; ideal membership (R2.5) | State the branch; never an unconditional "holds" |
| Polynomial identity under polynomial hypotheses | Groebner basis with `certify=true` on homogeneous generators, then `normalform` | Non-homogeneous or uncertified → R3u |
| An expression tree already in Symbolics or SymPy | Rebuild it in an exact ring above | R4 at most |

A `MethodError` from an R2 tool means the domain is unsupported, not UNDECIDED. Pick another row.
Code shapes and failure modes: `references/rungs-and-tools.md`.

## §2 Deny-list (SILENT DOWNGRADE and its cousins)

| Never | Instead |
|---|---|
| Write 記号的, 記号検算, シンボリック, 代数的に確認, symbolic or verified for R3–R5 | The §1 label of the rung reached |
| Verify equality by numeric substitution with a tolerance and report an identity check | R2; R5 only as a labelled smoke test |
| Swap a requested rung for a lower one without reporting the blocker first | §0 blocker table |
| Report R3 as final when R2 was never attempted | R3 may run first to find counterexamples; the rung stays R3 until R2 runs |
| Treat Python SymPy `==` as mathematical equality | It is structural; use R2 |
| Treat SymPy.jl `==` as a proof | It calls `equals`, which may decide by simplify or numeric sampling; use R2 |
| Treat Symbolics `isequal` or SymEngine `==` as mathematical equality | No equality guarantee is documented; use R2 |
| Read `simplify(expr) != 0` as a disproof | Find a counterexample at an exact point |
| Use AlgebraicNumbers.jl for equality | Its `==` compares numeric roots; use `QQBarField` |
| Sample only where the claim looks true (e.g. x > 0 for sqrt) | Sample the whole claimed domain, including negative and complex points |
| Fill a RECEIPT without having run the check | `evidence` must name the script and the deciding output line |

## §3 RECEIPT (SOLE home of the format)

One identity:

```text
identity:        <lhs> = <rhs>   (source locus)
domain:          <ring/field, generators, relations, claimed variable range>
requested:       R1 | R2 | R3 | R5 | none
used:            <method actually run>
rung:            R1 | R2 | R3 | R3u | R4 | R5 | UNDECIDED
blocked_by:      <why below the target; empty when the target was reached>
side_conditions: <d ≠ 0 per denominator, branches, tool assumptions; or none>
tool:            <package and version, or proof assistant and commit>
evidence:        <script path : the output line that decided it>
result:          holds | holds under <conditions> | fails (counterexample) | undecided (<reason>)
R3 only:         points, |S|, degree bound d, trials t, bound
```

Many identities: one shared header holds the common requested, tool and domain fields. Then write
one row per identity: id, locus, rung, result, side_conditions, blocked_by, evidence. Write it to a file next to the
checking script and name that path in the report. End with a summary line, e.g.
`R2: 70, R3: 9, UNDECIDED: 3`. The words 記号 or symbolic may appear only beside the R1/R2 counts.

## §4 R3 bound — how to state it

| Situation | Bound to quote |
|---|---|
| Nonzero polynomial, total degree ≤ d, coordinates independent and uniform on a finite S, \|S\| > d | false-accept ≤ d/\|S\| per trial; ≤ (d/\|S\|)^t over t independent trials |
| Rational-function identity, resampling points where a denominator vanishes | ≤ d/(\|S\| − e) per accepted point; d = degree of the cleared difference, e = degree of the denominators' product (corpus derivation) |
| Degree not computed | Read an upper bound off the expression structure; with no bound at all, label R3u |
| Points in a prime field GF(p) | Valid only with p drawn at random or shown not to divide coefficients or denominators; otherwise use exact rationals |
| A fixed seed reused across runs | The runs are not independent trials; count them as one |

The bound bounds a false accept given that the identity is false. It is not a probability that
the identity holds. The d/\|S\| form is a standard restatement; see `references/sources.md`.

## Execution model — solo by default

The modal case is one identity or a handful: SOLO, zero agents. Many independent identities fan out
by batch, one verifier per domain or tool batch, never one per identity. Each verifier returns RECEIPT
rows, not verdict sentences. Rung choice, labels and the final report stay SOLO with the editor, who
re-reads every row against its evidence. No harness → the same map, serial. If a constraint here
feels unnecessary, that feeling is the failure mode — follow the map.

## Reference index — load the file you need

| File | Covers | Read when |
|---|---|---|
| `references/rungs-and-tools.md` | Code shapes per R2 route, Calcium limits, Groebner `certify`, algebraic functions, R3 sampling, R4 tools, R1 handoff | before running any check |
| `references/sources.md` | Dated versions and guarantees per tool, primary sources, unverified items [dated:2026-10] | quoting a version or guarantee; rechecking after two quarters |
