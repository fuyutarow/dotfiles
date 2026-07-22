# Forge verification ledger — implementing-and-debugging (F3 artifact)

Append on reforge; never overwrite. First entry — no prior ledger existed for this skill.

## 2026-07-23 — combinatorial-flags rule grafted (v2607.1.0 → v2607.2.0)

**Placement (F2) decision**: the lesson (firedancer 実装台帳#14, 2026-07-23 — orthogonal flags
`feedback=:shared/:fa` × `credit_agg=:aggregate` passed every unit test yet one flag's function
was silently frozen only in combination, found only by a combinatorial test) is language-agnostic
test-design discipline — no Julia-specific content (no type stability, AD, GPU, package
architecture). Placed here, not in `writing-julia`, because this skill already owns
language-agnostic change-safety/verification (its routing row for `writing-julia`: "that skill
owns language-agnostic change-safety... this skill owns what correct Julia looks like inside that
frame"); `writing-julia`'s existing co-fire row already generically defers verification discipline
here, so no reciprocal pointer edit was needed there.

**Grafted onto**: DEBUG gate, immediately after the existing "Verify the fix reproduces-then-passes"
bullet — same family (test-before-done), extended rather than given a new section.
