# Agent assets

`skills/` contains in-house Agent Skills. `mise run skills:sync` installs bare-name copies into
`~/.claude/skills` and `~/.agents/skills`. Third-party skill source/name pairs
are declared in [`skills.thirdparty.toml`](skills.thirdparty.toml) and installed into tool-owned
global directories with `mise run skills:add` or `mise run skills:sync`.

`operating-the-harness` was retired on 2026-10-21. Its historical manual is in
[`../archives/skills/operating-the-harness/`](../archives/skills/operating-the-harness/); it is a
non-callable reference. Repository-local Claude/Codex configuration remains governed by its
declared source and executable checks under `scripts/harness/`.

The Sui integration corrections retained from the former vendor-local note are in
[`sui-vendor-integration-notes.md`](sui-vendor-integration-notes.md).
