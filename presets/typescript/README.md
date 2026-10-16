# TypeScript and optional React checks

Apply with `mise run preset -- apply typescript --to /path/to/repo`, install the
pinned dependencies with `bun install`, and paste `mise-tasks.toml` into the
consumer's mise configuration. Include `lint:ts`, `lint:oxlint-policy`, and
`typecheck` in its check gate. `lint:ts:all` checks the whole tree deliberately.

Keep `lint:oxlint-policy` directly under `check`, outside `lint` and the
`hook:pre-commit` dependency tree. The template supplies these aggregates; merge
their dependencies with existing tasks, including the repo's `fmt:staged` task.
An owner policy update must never block a consumer commit.

Rendered consumer configs record `settings.dotfiles.presetRevision`, a SHA-256
hash of the canonical policy, and `settings.dotfiles.presetCommit`, its dotfiles
commit ID. Checks read the committed policy at that recorded commit; owner
working-copy edits and subsequent alpha updates do not change an existing check.
The renderer locates dotfiles from its own installation path, independently of
the consumer's current directory. It reads with jj snapshots and operation-head
updates disabled; if jj cannot read the owner repository, it uses the colocated
Git commit objects. Neither path requires a writable dotfiles repository.
From dotfiles, run `mise run preset -- sync typescript --to /path/to/repo` to
adopt alpha's committed policy while preserving the consumer's package, compiler
settings, tasks, and local policy. Apply and writes of an already commit-recorded render also read alpha.
When the target has no rendered file, the renderer uses the policy beside its
own script and emits a one-line notice on stderr that no revision is recorded.
This first-adoption path works in exports without `.git` or `.jj`, produces a
hash-only legacy record, and preserves the historical rendering behavior.
`sync --dry-run` previews the render. A legacy hash-only or unversioned render
reports "rendered from an unrecorded revision; run preset sync"; no history search
is performed. Check and render exit 0 and preserve that legacy file until an
explicit `preset sync` records alpha's commit. Local edits at the recorded revision still fail check. Missing
commits or invalid committed policies fail explicitly without a checkout fallback.

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
means the report's `number_of_files`, not the number of diagnostics.

The `lint:ts` task calls the package bin `lint-ts-candidate` (installed with the
dotfiles helper bins by `mise run deps`). Under `mise run commit`, it exports
the J1 candidate: selected snapshot paths over the parent revision. Only changed
selected `.ts`/`.tsx` files are passed to `lint-oxlint.ts`; dependencies and config
come from that candidate, with the consumer's installed `node_modules` available.
It reports and skips lint when there are no matching files, including deletions.
Direct invocation checks changed TypeScript files in the current jj snapshot.
Malformed J1 context fails closed; there is no Git fallback.
