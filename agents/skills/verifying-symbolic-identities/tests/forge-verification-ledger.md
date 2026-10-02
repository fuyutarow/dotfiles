# verifying-symbolic-identities — forge verification ledger

Forge: 2026-10-03, v2610.1.0 (initial). Append findings here, never overwrite.

## Existence gate (F0)

- Function map: `an identity claim (paper equation, derivation step)` --verify and label-->
  `RECEIPT with rung` --> `report sentence at that rung, or handoff to proving-theorems for R1`.
- Ownership void: no skill owned identity verification. writing-julia owned package choice and
  taught "verify symbolic equality by numeric substitution at a few points with a tolerance"
  (`packages.md`, pre-edit). proving-theorems owns kernel proofs and its depth table had no CAS row.
- Blocking failure: an identity-verification run was reported as 「記号的検算」 while it was exact
  random-point evaluation (R3), with no CAS. A postmortem found no skill that would have stopped it.
- Knowledge artifact: soks unit CAS (01a0fd5c-582c-7190-9692-bcaaed261971), 23 verbatim evi.
- Expected decision-time delta: the rung table picks the R2 tool by domain in one lookup; the
  deny-list stops the R3-as-symbolic label before the report is written.
- EXTEND rejected: writing-julia is a code-and-package manual (a different stop condition);
  proving-theorems stops at a kernel receipt. Neither owns "which rung did this check reach".

## Provenance grades

| Claim | Grade | Source |
|---|---|---|
| Fraction-field equality iff ad = bc | A (docs, verbatim) | soks CAS-006 |
| QQBarField canonical form, exact `==` | A | soks CAS-004 |
| CalciumField zero test may throw | A | soks CAS-005 |
| Groebner `certify` homogeneous only | A | soks CAS-010 |
| SymPy simplify heuristic | A | soks CAS-009 |
| Rung ordering R1–R5 | B (corpus derivation from A rows) | soks CAS-Y001 |
| d/\|S\| per-trial bound | B (standard restatement; Schwartz prints a per-variable form) | soks CAS-012 |
| Code shapes in `rungs-and-tools.md` | C (API names from docs; not executed) | Nemo/AbstractAlgebra docs |

## Findings & verdicts

| # | Severity | Lens | Finding | Resolution |
|---|---|---|---|---|
| 1 | MAJOR | editor | Draft claimed SymEngine `expand(lhs-rhs)==0` is R2 for polynomials; no captured source says so | Removed; SymEngine labelled R4, R2 redone in AbstractAlgebra |
| 2 | MINOR | editor | CalciumField example asserted a specific identity decides | Replaced by placeholders; outcome not claimed |
| 3 | MINOR | floor | One reference sentence over 120 chars | Split |

## Mechanical floor

- `skill-check.ts agents/skills/verifying-symbolic-identities`: exit 0, 0 FAIL, 0 WARN.

## F3

- F3 solo-tier waiver (2026-10-03): trigger set desk-checked serially by the editor; no live
  model trigger eval ran. The independent verification lens ran after drafting (see below).

## Known deferrals

- Code shapes are not executed. A first real use should run R2.1 and R2.2 and record the output here.
- Richardson 1968, Zippel 1979 and Grégoire–Mahboubi 2005 are unverified (soks CAS-019).
