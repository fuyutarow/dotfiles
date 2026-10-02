# Sources — dated tool facts and primary references [dated:2026-10]

Every fact here was read from a primary source on 2026-10-03. Each is captured verbatim in the soks
corpus, unit CAS (`sok_unit_id` 01a0fd5c-582c-7190-9692-bcaaed261971). Row ids in brackets point
into that unit's ledger. Recheck a row after two quarters.

## Versions at capture

| Package | Version | Registered | Row |
|---|---|---|---|
| Oscar | 1.8.2 | 2026-09-02 | [CAS-001] |
| Nemo | 0.56.2 | 2026-09-29 | [CAS-001] |
| AbstractAlgebra | 0.50.3 | 2026-09-29 | [CAS-001] |
| Symbolics | 7.42.0 | 2026-10-01 UTC | [CAS-007] |
| SymPy | 1.14.0 | 2025-04-27 | [CAS-009] |
| Groebner.jl | 0.10.10 | 2026-09-14 | [CAS-010] |
| AlgebraicNumbers.jl | 0.1.11 | 2024-02-21 | [CAS-011] |
| FLINT (via Nemo) | 3.6.0 | 2026-06-29 (tag date) | [CAS-004] |

Layering: AbstractAlgebra is at the bottom, and Nemo wraps FLINT on top of it [CAS-001]. Hecke and
Singular.jl depend on Nemo. Oscar combines four cornerstones: GAP, Polymake, Antic, Singular.
Oscar 1.8.2 pins Nemo to 0.56.x [CAS-003].

## Guarantees per tool

| Tool | Guarantee as printed | Row |
|---|---|---|
| Nemo fractions | "Two fractions a/b and c/d are equal in Nemo iff ad = bc" | [CAS-006] |
| QQBarField | canonical form using minimal polynomials; `==` checks exactly | [CAS-004] |
| CalciumField | zero testing "will not always succeed"; Nemo throws; completeness over algebraic numbers is the paper's claim, not Nemo's | [CAS-005] |
| Symbolics simplify | assumes denominators are not zero; `isequal` carries no documented equality guarantee | [CAS-007] |
| SymPy simplify | uses heuristics; `equals` may return None; SymPy.jl `==` calls `equals` | [CAS-009] |
| SymEngine | `expand` and `==`; no simplification or equality guarantee documented | [CAS-008] |
| Groebner.jl | `certify` guarantees correctness for homogeneous ideals only | [CAS-010] |
| AlgebraicNumbers.jl | README claims exact equality; code compares numeric roots | [CAS-011] |
| Mathlib `ring` | normalises both sides and checks equality; no division | [CAS-016] |
| Mathlib `field_simp` | tries to discharge nonzero denominators; skips steps it cannot | [CAS-017] |
| Rocq `ring`/`field` | proof applies the correctness theorem; `field` emits nonzero goals | [CAS-018] |

## Theory

| Source | Statement | Row |
|---|---|---|
| Schwartz 1980, J. ACM 27(4) | Lemma 1 bounds zeros by a per-variable degree sum; Corollary 1 gives a count form | [CAS-012] |
| DeMillo–Lipton 1978, IPL 7(4) | P(m,d,r) ≥ (1 − d/r)^m over an integral domain | [CAS-013] |
| Schwartz 1980, Corollary 2 | modular evaluation adds a term for primes that divide the result | [CAS-012] |
| Moses 1971, CACM 14(8) | zero-equivalence, canonical and regular simplifiers | [CAS-014] |
| Buchberger–Loos 1982 | canonical simplifier exists iff equivalence is decidable; Richardson-class undecidability restated | [CAS-015] |

## Unverified

Richardson 1968, Zippel 1979 and Grégoire–Mahboubi 2005 had no legally open copy at capture.
Their results appear here only through the restatements above [CAS-019].
