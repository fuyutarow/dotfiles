# TypeScript and optional React checks

Apply with `mise run preset -- apply typescript --to /path/to/repo`, install the
pinned dependencies with `bun install`, and paste `mise-tasks.toml` into the
consumer's mise configuration. Include `lint:ts`, `lint:oxlint-policy`, and
`typecheck` in its check gate. `lint:ts:all` checks the whole tree deliberately.

To enable React checks, create `oxlint-policy.local.toml` in the consumer root:

```toml
schema = 1
ignore = []
react = ["ts/heritage-react/**"]
```

Run `mise run oxlint:render` after editing the declaration. The renderer adds
one override for exactly those globs, preserving the base plugins and adding
`react`. It sets `react/rules-of-hooks` and `react/exhaustive-deps` to error.
Outside those packages React rules stay disabled. Missing or empty `react`
leaves the rendered config unchanged. Applying the preset never creates an
empty local policy or copies the canonical policy into the consumer.

React Compiler checks, including `react/hooks` and
`react/exhaustive-effect-dependencies`, are deferred and explicitly off in the
React override. Other experimental nursery rules stay off under the base policy.
The policy comments link to the Oxc documentation for the two adopted rules.

The supplied `lint-oxlint.ts` runs the installed oxlint through `bun x --bun
--no-install`, avoiding its Node shebang. It requires a valid JSON report with a
positive checked file count and prints that count. Empty output, malformed output,
or zero files checked fail loudly with exit 2, even if oxlint exits 0. A count
means the report's `number_of_files`, not the number of diagnostics. The staged
task explicitly reports when no TypeScript or TSX files are staged and skips lint.
