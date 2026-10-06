---
name: writing-typescript
description: >-
  House TypeScript style — prefer type inference or `satisfies` over `as` casts; use `??` (nullish
  coalescing) not `||` for defaults; model absence with `undefined`/`null` before reaching for
  `""` sentinels; replace `switch` and nested ternaries with `ts-pattern`; validate/narrow with
  zod `safeParse` instead of hand-written type guards. Use when writing or
  reviewing TypeScript, or adopting the house oxlint/tsconfig setup in another repo. Not for language-agnostic change discipline
  (→ implementing-and-debugging), prose (→ linting-prose), or Bun script/runtime craft — spawn,
  bunx, deps, script anatomy (→ writing-bun-scripts).
paths: "**/*.{ts,tsx}"
---

# Writing TypeScript — house style

> **Version**: v2610.1.0 (2026-10-06) — names the enforced policy (oxlint-policy.toml) and ships the consumer-repo fixture.
> A lean per-filetype style floor; extend as house TS conventions accrete.

Each rule changes what you write. Prefer the `✅` form; flag the `❌` in review.

- **Inference / `satisfies` over `as`.** An `as` cast asserts a type the compiler can't verify —
  it silences errors instead of proving them. Avoid `const cfg = x as Config`.
  Let inference work, or use `const cfg = { .. } satisfies Config` to check compatibility.
  A pile of `as` casts is a design smell — the types aren't modeling the data.
- **`??` not `||` for defaults.** `||` treats `0`, `""`, `false` as absent — a bug when those are
  valid values. `❌ const n = count || 10` → `✅ const n = count ?? 10` (only null/undefined fall through).
- **Model absence honestly.** Ask whether `undefined`/`null` describes absence instead of a sentinel.
  For `name: string = ""`, decide whether `""` is a real name or an unset value.
  Prefer `name?: string` / `name: string | null` for the latter.
- **`ts-pattern` over `switch` / nested ternaries.** Exhaustive, typed matching beats a `switch`
  fall-through or a nested `? :` thicket. `❌ switch (kind) { .. }` / `a ? b ? c : d : e` →
  `✅ match(value).with(.., () => ..).exhaustive()`.
- **zod `safeParse` over hand-written type guards.** A hand-rolled `function isFoo(x): x is Foo`
  can drift from the type. Parse unknown input with the project's boundary schema and use the
  successful parsed output, not the original input asserted as a type.
  Derive the output type from that schema; record input/output differences when transformations apply.
  `satisfies`, brands, and annotations alone do not validate external values.
- **Template literal for controlled text; encoder/binder for a target language.**
  Use backticks for controlled text; ordinary `"` needs no source escape there.
  This does not escape data for JSON/HTML/SQL/shell. Use `JSON.stringify({ name, score })` for JSON.
  Use the target's DOM/framework, query parameters, argument vectors, or URL builder for other formats.
  Never pre-escape an interpolated value. A literal backtick
  or `${` is the remaining source-syntax exception; escape it only as literal syntax, not data.

## What is enforced, and in other repos

The rules above are style; what a gate enforces is `~/dotfiles/oxlint-policy.toml` — the one home
of the house lint policy (no `throw`, no `try`, no `as`, zod `safeParse`, …), each rule with its
reason. `.oxlintrc.json` is rendered from it, never edited. When a rule here and the policy
disagree, the policy wins and this file is stale.

A repo other than dotfiles adopts the same setup from [`assets/consumer-repo/`](assets/consumer-repo/):
copy `package.json` (rename it), `tsconfig.json` (adjust only `include`/`exclude`) and
`oxlint-policy.local.toml` (ignores only, each with a reason); paste `mise-tasks.toml` into its
`mise.toml` and add `lint:ts` and `lint:oxlint-policy` to its `lint` depends; then `bun install`
and `mise run oxlint:render`. `lint:ts` checks staged files only, so another session's WIP never
blocks a commit. `tests/consumer-repo.test.ts` fails when these files drift from dotfiles' own
pins, compilerOptions or rules.

## Cut

Invariant placement, schema/type authority, and construction-path design → `designing-type-contracts`.
This skill keeps TypeScript syntax and library idioms; the contract does not mandate a new dependency.

Language-agnostic change discipline (intent, scope, root-cause, regression) → `implementing-and-debugging`.
Prose/wording → `linting-prose`. This skill is ONLY the TypeScript-idiom floor.
Bun runtime & script craft — how a local script is built/run/tested/shipped, spawn/timeout,
bunx, the dependency ladder → `writing-bun-scripts`; in zero-config standalone scripts its
zero-dep floor beats this file's `ts-pattern`/`zod` rows (hand-rolled narrowing is the accepted
form until the script graduates to a package.json project). Seam owned there — agrees in
substance, do not diff for byte-identity.
