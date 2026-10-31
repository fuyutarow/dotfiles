# TypeScript and optional React checks

Apply with `mise run preset -- apply typescript --to /path/to/repo` and install
the pinned dependencies with `bun install`. The preset does not manage the
consumer's `mise.toml`; a consumer that adopts these tasks can merge the
applicable entries below into its own configuration. Include `lint:ts`,
`lint:knip`, and `typecheck` in its check gate. `lint:ts:all` checks the whole
tree deliberately. Verify the resulting tasks with the consumer's existing
`tools/mise-contract.ts` check.

```toml
# Merge these lint/check dependencies with the repo's existing gates.
# Consumers lint their own committed config; preset diff is an explicit owner operation.
#
# lint:ts checks changed candidate .ts/.tsx files from an immutable jj snapshot.
# lint:ts:all is the whole tree, for a deliberate sweep.

[tasks.lint]
depends = ["lint:ts"]

[tasks.check]
depends = ["lint", "lint:knip", "typecheck"]

[tasks."hook:pre-commit"]
depends = ["fmt:staged", "lint"]

[tasks."lint:ts"]
description = "oxlint --type-aware on the selected jj commit candidate files"
run = "lint-ts-candidate"

[tasks."lint:ts:all"]
description = "oxlint --type-aware on every TypeScript/TSX file the config does not ignore"
run = "bun lint-oxlint.ts --type-aware"

[tasks."lint:knip"]
description = "Fail on unused exports, files, dependencies, and binaries"
run = "bun lint-knip.ts"

[tasks.typecheck]
description = "Type-check with bun check against tsconfig.json (requires Bun >= 1.4.3)"
run = "bun require-bun.ts && bun check"

# In a consumer's fix task, keep knip report-only so cleanup remains deliberate:
# export/type fixes can leave declarations unused, dependency fixes can leave bun.lock stale,
# and deleting files needs review.
# run = "bun --no-env-file x --no-install --bun knip --no-progress --no-exit-code"
```

See [oxlint ownership and sync](../README.md#existing-presets) for the managed
house config and consumer wrapper contract. Rule reasons live in entry messages
and JSONC comments in `house.oxlintrc.json`.

To opt into React checks, edit the consumer's `.oxlintrc.json` and append a
standard override for its package globs:

```jsonc
{
  "files": ["ts/heritage-react/**"],
  "plugins": ["eslint", "typescript", "unicorn", "oxc", "node", "react"],
  "rules": {
    "react/rules-of-hooks": "error",
    "react/exhaustive-deps": "error",
    // React Compiler checks remain deferred.
    "react/hooks": "off",
    // React Compiler checks remain deferred.
    "react/exhaustive-effect-dependencies": "off"
  }
}
```

Add local ignores to the wrapper's `ignorePatterns` with a reason comment.

Dotfiles' root config extends the preset locally and adds its vendored-zod import
restrictions. `dotfiles-plugin.js` gives those selectors a separate plugin identity
so they do not replace the inherited house selectors. Consumers receive neither
this plugin nor the root config. The root also retains the no-sync scanner's
options and dotfiles ignores; ordinary lint leaves no-sync off and the separate
baseline scanner enables it. Every custom entry has bad/good proof in
`fixtures.json`, run by `../tests/oxlint-custom.test.ts`; snippets are executed
in temporary repositories outside the checkout.

The supplied `lint-oxlint.ts` runs the installed oxlint through `bun x --bun
--no-install`, avoiding its Node shebang. It requires a valid JSON report with a
positive checked file count. Empty output, malformed output, or zero files
checked fail with exit 2. A count means `number_of_files`, not diagnostics.

The create-only `knip.jsonc` keeps coralbase's `ignoreExportsUsedInFile`, explicit
test and top-level script entry roots, reason-commented CLI-only dependency
ignores, and the `mise` binary ignore. Add nested executable CLIs to `entry`
explicitly; add workspace blocks when the consumer becomes a monorepo. Knip is
pinned to `6.42.1` in the package template. `lint-knip.ts` runs only that local
pin through `bun --no-env-file x --no-install --bun`, prints finding counts and
names by kind, and exits 1 for findings or 2 for empty/malformed output or when
no project files match. Its checked-file count means unique files matched by
workspace `project` patterns. The `check` aggregate depends on `lint:knip` so a
consumer resolves existing findings before adopting the preset. Coralbase keeps
knip report-only in `fix` and does not gate its `check`; the preset's `fix`
snippet preserves report-only behavior while its check gate is deliberately
stricter.

The `lint:ts` task calls the package bin `lint-ts-candidate`. Under `mise run
commit`, it checks changed selected TypeScript files from the immutable J1
candidate. Direct invocation checks changed TypeScript files in the current jj
snapshot. Missing J1 context fails closed. Merge the template's aggregates with
existing tasks, including the repo's `fmt:staged` task.
