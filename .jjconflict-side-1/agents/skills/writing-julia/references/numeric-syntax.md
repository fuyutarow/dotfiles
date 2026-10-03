# Numeric syntax — verify the parsed expression before fixing the index

**SOLE owner:** numeric-literal coefficients, exponent-notation ambiguity, and expression-preserving repairs.
`performance.md` §2.8 owns JET entrypoints and diagnostic coverage.

## Authoring and repair rule

Use explicit `*` for coefficient multiplication in index, size, and offset calculations.
Also use explicit `*` when multiplying a variable whose name starts with `e`, `E`, or `f` by a number.
This is a house readability rule; Julia allows numeric-literal coefficients and variables named `e` or `f`.
Keep scientific notation when a floating-point constant is intended.

| Expression | Meaning / action |
|---|---|
| `4e-3` | Floating-point literal `0.004`; it does not read a variable named `e`. |
| `4 * e - 3` | Multiply first, then subtract; at `e = 5`, the result is `17`. |
| `4 * (e - 3)` | Subtract first; at `e = 5`, the result is `8`. |
| `1.5f22` | Float32 exponent notation, not multiplication by `f22`. |
| `1.5 * f22` | Explicit multiplication by the variable. |
| `1 / 2x` | Numeric-coefficient precedence groups the denominator; preserve it as `1 / (2 * x)`. |
| `2^3x` | Preserve the exponent grouping as `2^(3 * x)`, not `(2^3) * x`. |

For a reported `x[4e-3]` failure, inspect the intended index equation and the receiver/index types.
Do not insert parentheses or convert the literal to `Int` merely to silence the error.
Do not use whitespace as the repair contract: write the intended multiplication and grouping explicitly.
If the intended equation is ambiguous, obtain that equation before changing its meaning.

## Choose the check by the claim

| Claim being checked | Check | Limit |
|---|---|---|
| What Julia parsed | `Meta.parse` / `Meta.show_sexpr` on the minimal expression | Parses syntax; does not recover the author's intent. |
| Correct index arithmetic | A small regression case with the expected index and accessed element | A wrong expression can still have an integer type. |
| Possible runtime error for known argument types | JET error analysis, then a focused execution test | Use `@report_call` / `@test_call`; see `performance.md` for coverage limits. |
| Runtime dispatch / inference problems | JET optimization analysis | `@report_opt` / `@test_opt` are not substitutes for error or numerical-result tests. |
| Source-style prohibition | A verified syntax/token-aware rule in the project's linter | Record its name/version and test both rejected multiplication shorthand and accepted scientific constants. |

Runic normalizes float spelling; a formatter cannot be assumed to restore multiplication intent.
A rule rejecting implicit multiplication alone will not catch `4e-3`, which already parses as a float literal.
Rejecting float literals in every indexing expression also needs receiver-specific scope: custom indexing may be valid.
Do not claim a style rule is impossible because the syntax is legal, or that no linter has one without a bounded search.
Do not invent a StaticLint/Runic rule name. If no verified rule is available, report that limit and use the focused tests above.

## Provenance

Distilled from soks position `urn:uuid:01a0cdef-9a86-7127-994d-2d86e91b0a2d`
(`sok-julia_numeric_literals_and_diagnostics.md`), claims JLIT-001–006 and JLIT-Y01.
The explicit-multiplication preference is skill-supplied; the parsing and tool-role boundaries are source-supported.
The bounded survey did not test every linter or execute every Julia/JET version combination.
