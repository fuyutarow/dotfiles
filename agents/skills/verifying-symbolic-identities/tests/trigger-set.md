# verifying-symbolic-identities — fire / no-fire trigger set (F3 artifact)

Desk-check against the FULL collection after any description edit. Read only name and description.

## FIRES

| Ask | Why |
|---|---|
| 「論文の式 (12) が恒等式か Julia で記号的に検算して」 | R2 in the fraction field; label the rung |
| "Check that (x^2-y^2)/(x-y) == x+y exactly, not numerically" | rational-function identity, R2 |
| 「さっきの検算、乱数点で Rational に代入しただけ? それで記号的って書いていいの?」 | labelling an R3 result; §2 deny-list |
| "Is sqrt(3)+i a root of x^4-4x^2+16? need an exact answer" | algebraic numbers, QQBarField |
| 「SymPy の simplify が 0 にならない。この恒等式は間違い?」 | R4 non-zero shows nothing; §2 |
| "my 82 identity checks used isapprox at 3 points — enough for the appendix?" (no CAS keyword) | R5 relabelling; VS0/VS4 |
| 「Groebner で仮定の下の等式を確かめたい。certify って要る?」 | ideal membership; Groebner caveat |
| 「exp と sin が入った等式を厳密に判定できる?」 | CalciumField or UNDECIDED |

## Co-fire (with order)

| Ask | Order |
|---|---|
| 「この恒等式を CAS で確かめてから Lean で証明して」 | HERE (R2, cofactors) → `proving-theorems` (R1) |
| "Write a Julia script that checks all identities in the paper" | HERE (rung and RECEIPT) with `writing-julia` (JG gates on the script) |

## MUST NOT FIRE (near-miss — same vocabulary, different owner)

| Ask | Route |
|---|---|
| 「Symbolics + ModelingToolkit で ODE を組んで build_function」 | `writing-julia` |
| "SymEngine の Basic を ForwardDiff に通すと MethodError" | `writing-julia` |
| "Formalize this inequality in Lean 4 and find the right Mathlib lemma" | `proving-theorems` |
| 「この数値実験の結果はベースラインと比較可能?」 | `validating-experimental-evidence` |
| "Survey the Julia computer algebra ecosystem for a report" | `systematizing-knowledge` |
| 「Oscar の install が 10 分かかる、precompile を速くしたい」 | `writing-julia` |

## Desk-check log

- 2026-10-03 (v2610.1.0, initial): all 16 rows desk-checked against this description and the
  descriptions of writing-julia, proving-theorems, validating-experimental-evidence and
  systematizing-knowledge. Row "82 identity checks used isapprox" fires on "numeric checks as
  verification". No contested row. No live trigger eval ran.
