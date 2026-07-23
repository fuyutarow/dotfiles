---
name: writing-typescript
description: House TypeScript style — prefer type inference or `satisfies` over `as` casts; use `??` (nullish coalescing) not `||` for defaults; model absence with `undefined`/`null` before reaching for `""` sentinels; replace `switch` and nested ternaries with `ts-pattern`; validate/narrow with zod `safeParse` instead of hand-written type guards. Auto-activates when .ts/.tsx files are in play; also use when writing or reviewing TypeScript. Not for language-agnostic change discipline (→ implementing-and-debugging), prose (→ linting-prose), or Bun script/runtime craft — spawn, bunx, deps, script anatomy (→ writing-bun-scripts, whose zero-dep floor wins in standalone scripts).
paths: "**/*.{ts,tsx}"
---

# Writing TypeScript — house style

> **Version**: v2607.1.0 (2026-07-04) — distilled from the house `/LINT_TS` prompt.
> A lean per-filetype style floor; extend as house TS conventions accrete.

Each rule changes what you write. Prefer the `✅` form; flag the `❌` in review.

- **Inference / `satisfies` over `as`.** An `as` cast asserts a type the compiler can't verify —
  it silences errors instead of proving them. `❌ const cfg = x as Config` → `✅` let inference
  do it, or `const cfg = { .. } satisfies Config` (checks the shape AND keeps the narrow type).
  A pile of `as` casts is a design smell — the types aren't modeling the data.
- **`??` not `||` for defaults.** `||` treats `0`, `""`, `false` as absent — a bug when those are
  valid values. `❌ const n = count || 10` → `✅ const n = count ?? 10` (only null/undefined fall through).
- **Model absence honestly.** Before an empty-string `""` (or `-1`, sentinel) to mean "no value",
  ask whether `undefined`/`null` models absence more correctly. `❌ name: string = ""` (is "" a
  real name or "unset"?) → `✅ name?: string` / `name: string | null`.
- **`ts-pattern` over `switch` / nested ternaries.** Exhaustive, typed matching beats a `switch`
  fall-through or a nested `? :` thicket. `❌ switch (kind) { .. }` / `a ? b ? c : d : e` →
  `✅ match(value).with(.., () => ..).exhaustive()`.
- **zod `safeParse` over hand-written type guards.** A hand-rolled `function isFoo(x): x is Foo`
  can drift from the type. `❌ if (isUser(data))` → `✅ const r = User.safeParse(data); if (r.success) ..`
  — one schema is the source of truth for both the runtime check and the static type (`z.infer`).

## Cut

Language-agnostic change discipline (intent, scope, root-cause, regression) → `implementing-and-debugging`.
Prose/wording → `linting-prose`. This skill is ONLY the TypeScript-idiom floor.
Bun runtime & script craft — how a local script is built/run/tested/shipped, spawn/timeout,
bunx, the dependency ladder → `writing-bun-scripts`; in zero-config standalone scripts its
zero-dep floor beats this file's `ts-pattern`/`zod` rows (hand-rolled narrowing is the accepted
form until the script graduates to a package.json project). Seam owned there — agrees in
substance, do not diff for byte-identity.
