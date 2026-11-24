---
name: writing-typescript
description: >-
  House TypeScript style — prefer type inference or `satisfies` over `as` casts; use `??` (nullish
  coalescing) not `||` for defaults; model absence with `undefined`/`null` before reaching for
  `""` sentinels; replace `switch` and nested ternaries with `ts-pattern`; validate/narrow with
  zod `safeParse` instead of hand-written type guards. Use when writing or
  reviewing TypeScript, or adopting the house oxlint/tsconfig setup in another repo. Prose → linting-prose; Bun script/runtime craft — spawn,
  bunx, deps, script anatomy (→ writing-bun-scripts).
paths: "**/*.{ts,tsx}"
---

# Writing TypeScript — house style

> **Version**: v2611.1.0 (2026-11-25) — code-shape checks are oxlint entries, each proved by fixtures.
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

The enforced house rules live in dotfiles' `standard-presets/typescript/.oxlintrc.json`,
a hand-written standard oxlint config. Each custom entry explains its reason in
`message`; disabled rules retain their reasons as JSONC comments. Bad/good
fixtures beside the config prove every custom entry.

From dotfiles, install the preset with:

```sh
mise run preset -- apply typescript --to /path/to/repo
```

The consumer owns and commits copies of `.oxlintrc.json`, `house-plugin.js`,
`package.json` (rename it), `tsconfig.json` (adjust include/exclude), `zod.ts`,
`lint-oxlint.ts`, and `mise-tasks.toml`. Merge the task fragment into its mise
config and run `bun install`. Lint reads only the consumer's own config and
plugin. Add ignores or React overrides directly using oxlint's standard format.

Run `mise run preset -- diff typescript --to /path/to/repo` from dotfiles to
inspect drift. `sync typescript --to /path/to/repo` replaces only the oxlint
config and its plugin; review and commit the change. Dotfiles' root extends the
preset locally and adds its vendored-zod restrictions and its relative-import ban,
which consumers do not receive. `lint:ts` checks changed candidate files;
`lint:ts:all` checks the whole tree. Dotfiles keeps its JSON codec in
`@dotfiles/hooks/zod.ts`.

## Adding a check

A rule about the shape of code — a syntax form, an import, a call — is an oxlint entry,
not a script. Write a custom script only for what oxlint cannot see (several files at once,
repository state, non-TypeScript files), and record that reason in the script's header.
When a script's check becomes expressible in oxlint, move it and delete the script, its task,
its exception file and its tests in the same change.

- **Selectors cover every form of the construct.** An import appears as `ImportDeclaration`,
  `ExportNamedDeclaration`, `ExportAllDeclaration`, `ImportExpression` (all with `source.value`)
  and `TSImportType` (`import("x").T`, also `source.value`); a rule that names only the first
  lets the others through.
- **One plugin alias per group you may switch off.** An override that names a rule key replaces
  the root's options for that key; it does not merge. Give each separately exempted group its
  own alias — a one-line `export { default } from "oxlint-plugin-eslint"` registered in
  `jsPlugins` (dotfiles: `dotfiles-js`, `one-home`, `no-relative`) — so turning one group off
  for some files keeps every other group in force there.
- **Prove each entry.** Add a `fixtures.json` row per entry: `scope` (the alias), `entry` (its
  index), `bad` snippets that must hit it exactly once, and `good` near-misses that must not.
  `standard-presets/tests/oxlint-custom.test.ts` also fails when an entry has no row.

## Cut

Invariant placement, schema/type authority, and construction-path design → `base-usecase-first`.
This skill keeps TypeScript syntax and library idioms; the contract does not mandate a new dependency.

Follow repository instructions for implementation and debugging. Prose/wording → `linting-prose`.
This skill is ONLY the TypeScript-idiom floor.
Bun runtime & script craft — how a local script is built/run/tested/shipped, spawn/timeout,
bunx, the dependency ladder → `writing-bun-scripts`; in zero-config standalone scripts its
zero-dep floor beats this file's `ts-pattern`/`zod` rows (hand-rolled narrowing is the accepted
form until the script graduates to a package.json project). Seam owned there — agrees in
substance, do not diff for byte-identity.
