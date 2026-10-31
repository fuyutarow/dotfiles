# Configuration presets by language

`standard-presets/` holds one configuration preset per language: typescript, python, rust,
julia, and latex. Each language lives in `standard-presets/<name>/` with a
`preset.toml` and its source files. The CLI discovers manifests at runtime;
adding a preset requires a directory, with no CLI edit. Oxlint belongs to the
TypeScript preset. The textlint preset has been removed.

## Apply and compare

From dotfiles:

```sh
mise run preset -- list
mise run preset -- apply typescript --to /path/to/repo
mise run preset -- apply typescript --to /path/to/repo --dry-run
mise run preset -- diff typescript --to /path/to/repo
mise run preset -- sync typescript --to /path/to/repo
```

`list` prints names and descriptions in the language order above, followed by
additional presets in name order. `apply` copies the declared
files and creates destination parent directories; `--dry-run` previews writes.
`diff` prints unified diffs and exits 1 on drift, or 0 when current. The previous
`diff <name> /path/to/repo` form remains supported. Usage or manifest errors exit 2. The target directory must already exist.

## Manifest contract

For example, add `standard-presets/demo/preset.toml` and `standard-presets/demo/config.toml`:

```toml
name = "demo"
description = "Example project configuration"
files = [{ source = "config.toml", destination = ".config/demo.toml" }]
check = ["bun test standard-presets/demo/tests"]
```

- `name` must match the directory name and contain lowercase letters, digits,
  and hyphens, starting with a letter or digit.
- `description` is a nonempty description shown by `list`.
- `files` is a nonempty array of `{ source, destination }` mappings. Sources are
  relative to the preset directory; destinations are relative to the target
  repository. Paths must be nonempty and relative, with no `..` component.
  Destination paths must be unique. A missing source fails with its path.
- An optional `createOnly = true` on a file mapping copies it only when its
  destination is absent. An existing destination is excluded from apply and
  diff, preserving project customization. The default replaces the file.
- Optional `requiredJsonKeys = ["section.key"]` on a mapping checks those
  dot-separated object paths against the same source JSON file. Source values
  must exist; invalid declarations fail discovery before writes. `diff` and
  `sync` report missing or different values (including their key paths) and exit
  1, including for `createOnly` files. Additional consumer keys are ignored;
  these checks never modify JSON. Missing or invalid consumer JSON also fails.
- Optional `check = [commands]` records commands that prove the preset with its
  fixtures. Run them from the dotfiles root. These are verification metadata;
  list, apply, and diff do not execute them.

Discovery examines immediate subdirectories containing `preset.toml`; `src/`,
`tests/`, and other directories without a manifest are ignored. Invalid manifests
or missing sources fail discovery before any target writes. Registering `standard-presets/`
as a configuration surface covers new kinds without registry edits.

## Existing presets

`typescript` copies `tsconfig.json`, create-only `tsconfig.vendored.json`,
`package.json`, create-only `knip.jsonc`, `zod.ts`, `lint-oxlint.ts`,
`lint-knip.ts`, `.oxlintrc.json`, `house.oxlintrc.json`, and its JS plugin.
It does not manage the consumer’s `mise.toml`; its task example is documentation,
and consumers verify adopted tasks with their existing mise contract check. See
[the TypeScript README](typescript/README.md) for that snippet, React opt-in,
the checked oxlint runner, and the knip gate.
Dotfiles extends `typescript/tsconfig.json`, keeping its own include/exclude paths at the
root. Consumers may tighten compiler options; weakening the preset is drift.

The contract-tool `preset sync <repo>` command maintains `tsconfig.vendored.json`
from the installed tools' `.preset-sync.json` manifests. The TypeScript config
extends this file, and `lint-oxlint.ts` uses the same exclusions. Commit the
generated file and rerun contract-tool sync when installing or updating tools;
the language preset preserves it and does not report its generated contents as
drift. Files outside those manifests remain in scope, including other files in
`tools/`.

TypeScript's `package.json` is created only when absent and then belongs to the
consumer. Its manifest selects the house devDependency pins (including knip
6.42.1) and `engines.bun`
for key checks; their required values live only in the package template.
Consumers retain their own name, bins, workspaces, type, dependencies and extra
devDependencies. Fix reported package key drift in the consumer; sync preserves
the package bytes.

TypeScript defaults to `tools/` for scripts, `.oxlint/` for the house config and
plugin, and `src/zod.ts` for the codec. A consumer entry in `consumers.toml` may
override these relative directories with, for example,
`placement = { scripts = "scripts", oxlint = "config/lint", source = "lib" }`.
Omitted fields use the defaults. Apply, diff, sync and the consumer gate use the
same placement. Sync migrates matching root-layout files to that placement and
updates the wrapper's house extends path. Root files matching the current template or a recorded released hash migrate;
unknown root bytes, occupied destinations, and a
wrapper without the expected extends entry are reported as conflicts before
any migration writes. Resolve them manually and retry; `--dry-run` previews moves.
The `lint:ts` example passes `--dir tools` to locate the default placed runner.
Candidate selection and oxlint resolve from the consumer root; use `--dir` to
locate a runner in another directory.

The TypeScript preset owns `house.oxlintrc.json` and `house-plugin.js`, compared
against their placed versions by `preset diff`. The consumer owns
`.oxlintrc.json`: apply creates it only when absent, with
`"extends": ["./.oxlint/house.oxlintrc.json"]` by default and an empty `ignorePatterns` list.
Put repository ignores and optional React overrides in that wrapper; its edits
are excluded from drift checks and preserved by apply and sync.
`preset sync typescript` refreshes the managed house config and plugin, creating
the wrapper if absent. Consumers commit all three files and lint reads those
local files. Existing consumers must add the extends entry to their wrapper
when adopting the split. Dotfiles itself extends the house file using a
repository-local path.

`python` supplies uv project metadata, Ruff/Pyright settings, hooks, mise tasks,
and optional examples. `rust` supplies Cargo workspace lints, build profiles,
rustfmt/clippy defaults, and mise tasks. `julia` supplies package/test project
skeletons and Runic tasks. `latex` supplies LuaLaTeX build settings, formatting,
mise tasks, and generated-artifact ignores.

## Fixtures

`bun test standard-presets` checks manifest discovery and CLI apply/diff behavior using
temporary repositories outside the workspace. It also runs TypeScript and oxlint
fixtures against the pinned tools: good cases pass and bad cases trigger their
declared rule. The suite checks that the consumer preset does not weaken
dotfiles' strict TypeScript flags or oxlint levels. Each kind can add its own
fixtures and name their verification commands in `check`.

Before releasing a managed template change, run `mise run preset -- record-hashes` to append its current SHA-256 hash; keep all prior hashes. The suite requires every current managed template to be recorded.
