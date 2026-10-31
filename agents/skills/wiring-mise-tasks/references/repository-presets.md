# Repository-owned setup and gate patterns

Read when a repository opts into jj bootstrap, literal tool authority, or the optional
TypeScript SDK portability split. These are copy-out patterns: a consumer commits the copied
source and calls only its own files from mise tasks.

## jj-first setup

Make `setup:jj` the first dependency of the repository's `setup` aggregate. Its helper belongs
at `tools/setup-jj.ts` and runs through a pinned runtime:

```toml
[tasks.setup]
alias = "i"
depends = ["setup:jj", "setup:tools", "setup:language"]

[tasks."setup:jj"]
hide = true
description = "Initialize colocated jj and track alpha@origin; safe to repeat"
run = "bun --no-env-file tools/setup-jj.ts"

[tasks."setup:tools"]
depends = ["setup:jj"]

[tasks."setup:language"]
depends = ["setup:jj"]
```

Array order alone does not serialize mise dependencies. Make every other setup branch depend on
`setup:jj` (directly or through a predecessor) so no install starts before jj initialization.
The copied helper must be safe to repeat. Initialize colocated jj only if `.jj/` is absent;
verify that `alpha@origin` exists before tracking it; set local
`core.hooksPath = .githooks` only if `.githooks/` is a directory. Without that directory,
leave any existing hooks setting untouched. The helper must not fetch, rebase, move `alpha`, or
write outside the consumer repository.

## Repository tool authority

Operator tools are machine-wide Bun installs, with one version per machine. Repository contract
tools are source copies under the consumer's `tools/`. Pull them with `preset sync <repo>`;
repeat `--tool <name>` to select tools, and add `--check` to compare against the recorded source
commit. This is distinct from `mise run preset -- apply|sync ...`, the standard-presets CLI.
Every task and `check` gate must resolve its command through the repo's `[tools]` pins or its own
`tools/` directory. A repository gate must not call an operator tool or name a dotfiles/skill
path.

An adopted `tools:contract` check should inspect literal commands in mise task bodies, root
package scripts, and repository scripts; fail when a command has neither `[tools]` authority nor
a local `tools/` implementation; and fail when a forbidden package alias appears in either
`package.json` or the lockfile. Keep the forbidden package names in the copied checker policy,
not in machine-global config. Include the task in `check.depends` in the same change that adds it:

```toml
[tasks."tools:contract"]
hide = true
description = "Check task and script commands against repository-owned tool pins"
run = "bun --no-env-file tools/tools-contract.ts"

[tasks.check]
depends = ["fmt:check", "lint", "test", "tools:contract"]
```

Static command inspection is bounded: dynamic command construction and computed aliases need
their own language-level checks. The checker does not run the inspected tasks or scripts.

## Optional TypeScript SDK portability split

Use this only for a package that promises a runtime-neutral library entrypoint. Keep the public
library config separate from runtime and test checks:

```jsonc
// tsconfig.json — library surface
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": { "types": [], "lib": ["ESNext", "DOM"] },
  "files": ["src/index.ts"],
  "include": []
}
```

```jsonc
// tsconfig.runtime.json — runtime, scripts, and tests
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": { "types": ["bun"], "lib": ["ESNext", "DOM"] },
  "include": ["**/*.ts"],
  "exclude": ["node_modules"]
}
```

Run both checks from the package's `typecheck` script. Add a browser-bundle test for the public
entrypoint using the project's bundler with its browser target; fail on unresolved Node/Bun
imports or runtime-only globals. Keep this preset opt-in: server-only packages and packages
without a browser-consumer promise need no second config or bundle test.

## Gate results and alpha

Run the aggregate with `mise run --continue-on-error check` so one invocation reports every
failing gate. Run independent gate lanes in parallel; preserve every lane's exit status and
advance `alpha` only after all required lanes pass. Keep a serial commit hook when its snapshot
or resource contract requires serialization; parallel CI lanes do not change the commit hook's
scope.
