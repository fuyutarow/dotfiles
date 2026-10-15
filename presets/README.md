# TypeScript presets

`presets/` is the home for project configuration dotfiles shares with other repositories.
The TypeScript preset (`ts/`) and oxlint policy (`oxlint/`) are the consumer-facing source files;
dotfiles' root `tsconfig.json` and `.oxlintrc.json` are derived from them.

## Apply and check

From dotfiles, run `mise run preset -- apply ts --to /path/to/repo` or `mise run preset -- apply oxlint --to /path/to/repo`.
Add `--dry-run` to preview writes. Run `mise run preset -- diff ts /path/to/repo` or
`mise run preset -- diff oxlint /path/to/repo` to see unified diffs and get exit 1 when files drift.
The CLI writes only the preset's declared files under the target directory.

The TypeScript preset includes `tsconfig.json`, `package.json`, `zod.ts`, and `mise-tasks.toml`.
The oxlint preset includes `oxlint-policy.toml`; its generated `.oxlintrc.json` includes the preset's
house rules and the target's reasoned `oxlint-policy.local.toml` ignores. That local file can add
ignores only. Consumers may tighten TypeScript compiler options; weakening the preset is drift.

Dotfiles extends `ts/tsconfig.json` and keeps only its own `include`/`exclude` paths at the root.
`oxlint/policy.toml` is rendered to the root `.oxlintrc.json` by `mise run oxlint:render`.

The root `oxlint-policy.toml` is a relative symlink to `presets/oxlint/policy.toml`.
It remains a compatibility alias for external consumers, including coralbase and firedancer,
until their tasks and documentation migrate. Edit the canonical file under `presets/oxlint/`;
the alias contains no second policy copy.

## Fixtures

`bun test presets` runs each fixture against the real pinned tools. TypeScript fixtures check
compiler acceptance, and oxlint fixtures check their declared rule. `good/` cases must pass;
each `bad/` case names the rule it must trigger. The suite also checks that no strict TypeScript
flag or oxlint level is weaker in the consumer preset than in dotfiles.
