# Configuration presets by language

`presets/` holds one configuration preset per language: typescript, python, rust,
julia, and latex. Each language lives in `presets/<name>/` with a
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
```

`list` prints names and descriptions in the language order above, followed by
additional presets in name order. `apply` copies the declared
files and creates destination parent directories; `--dry-run` previews writes.
`diff` prints unified diffs and exits 1 on drift, or 0 when current. The previous
`diff <name> /path/to/repo` form remains supported. Usage or manifest errors exit
2. The target directory must already exist.

## Manifest contract

For example, add `presets/demo/preset.toml` and `presets/demo/config.toml`:

```toml
name = "demo"
description = "Example project configuration"
files = [{ source = "config.toml", destination = ".config/demo.toml" }]
check = ["bun test presets/demo/tests"]
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
- Optional `check = [commands]` records commands that prove the preset with its
  fixtures. Run them from the dotfiles root. These are verification metadata;
  list, apply, and diff do not execute them.

Discovery examines immediate subdirectories containing `preset.toml`; `src/`,
`tests/`, and other directories without a manifest are ignored. Invalid manifests
or missing sources fail discovery before any target writes. Registering `presets/`
as a configuration surface covers new kinds without registry edits.

## Existing presets

`typescript` copies `tsconfig.json`, `package.json`, `zod.ts`, `mise-tasks.toml`, and
`lint-oxlint.ts`. See [the TypeScript README](typescript/README.md) for React opt-in
and the checked oxlint runner.
Dotfiles extends `typescript/tsconfig.json`, keeping its own include/exclude paths at the
root. Consumers may tighten compiler options; weakening the preset is drift.

The preset renders `.oxlintrc.json` from dotfiles' canonical
`typescript/policy.toml` and the target's optional `oxlint-policy.local.toml`.
It creates neither a policy copy nor an empty local file. When local ignores are
needed, use `typescript/local.example.toml` as a template and add reasoned entries;
the local file may add ignores and opt into React rules with `react = [package globs]`.
A missing local file means no additions.
`apply` reports an existing unused `oxlint-policy.toml` copy for manual review
and removal, preserving its bytes.

`mise run oxlint:render` renders `typescript/policy.toml` to dotfiles' root
`.oxlintrc.json`. The root `oxlint-policy.toml` remains a relative symlink to
`presets/typescript/policy.toml` for external consumers. Edit the canonical preset
policy; the alias contains no second copy.

The policy owns `node/no-sync` options and test-file exclusions. Ordinary oxlint
keeps that rule off; `lint:no-sync` enables the rendered entry for its baseline
and call-site exemption scan. No rule options are duplicated in the scanner.

`python` supplies uv project metadata, Ruff/Pyright settings, hooks, mise tasks,
and optional examples. `rust` supplies Cargo workspace lints, build profiles,
rustfmt/clippy defaults, and mise tasks. `julia` supplies package/test project
skeletons and Runic tasks. `latex` supplies LuaLaTeX build settings, formatting,
mise tasks, and generated-artifact ignores.

## Fixtures

`bun test presets` checks manifest discovery and CLI apply/diff behavior using
temporary repositories outside the workspace. It also runs TypeScript and oxlint
fixtures against the pinned tools: good cases pass and bad cases trigger their
declared rule. The suite checks that the consumer preset does not weaken
dotfiles' strict TypeScript flags or oxlint levels. Each kind can add its own
fixtures and name their verification commands in `check`.
