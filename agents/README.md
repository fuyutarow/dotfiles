# Agent assets

`skills/` contains in-house Agent Skills. `mise run skills:sync` installs the Claude plugin
`dotfiles:<name>` and copy-installs the same skills for Codex. Third-party skill source/name pairs
are declared in [`skills.thirdparty.toml`](skills.thirdparty.toml) and installed into tool-owned
global directories with `mise run skills:add` or `mise run skills:sync`.

The Sui integration corrections retained from the former vendor-local note are in
[`sui-vendor-integration-notes.md`](sui-vendor-integration-notes.md).
