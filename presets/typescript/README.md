# TypeScript and optional React checks

Apply with `mise run preset -- apply typescript --to /path/to/repo`, install the
pinned dependencies with `bun install`, and merge `mise-tasks.toml` into the
consumer's mise configuration. Include `lint:ts` and `typecheck` in its check
gate. `lint:ts:all` checks the whole tree deliberately.

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

The `lint:ts` task calls the package bin `lint-ts-candidate`. Under `mise run
commit`, it checks changed selected TypeScript files from the immutable J1
candidate. Direct invocation checks changed TypeScript files in the current jj
snapshot. Missing J1 context fails closed. Merge the template's aggregates with
existing tasks, including the repo's `fmt:staged` task.
