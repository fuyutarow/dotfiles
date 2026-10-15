+++
schema = 2
name = "jj-ws-rename"
outcome = "the workspace tool's directory and package are named for what they are (owner decision 2026-10-16: 'jj-ws でいいよ'): tools/workspace/ becomes tools/jj-ws/ and the package @dotfiles/workspace becomes @dotfiles/jj-ws; the command stays `ws`; every reference follows — root package.json:23 bin path, scripts/config-registry.ts:481, lint/no-sync-baseline.tsv:133-134 paths (counts unchanged), tools/spec/workspace.md (rename to tools/spec/jj-ws.md and update its first lines and the agx scope sentence it quotes), the README Architecture tools list, CLAUDE.md is NOT edited here (list any mention under for_coordinator), imports from other tools, and any test or fixture path; history files (.changes, CHANGELOG) keep their old text"
writes = [".ws.toml", "tools/workspace/**", "tools/jj-ws/**", "package.json", "bun.lock", "scripts/config-registry.ts", "lint/no-sync-baseline.tsv", "tools/spec/**", "README.md", "tools/agx/docs/scope.md", "tools/*/src/**", "tools/*/tests/**", "scripts/**", "mise.toml"]
verify = ["bun test tools/jj-ws", "mise run lint:ts", "mise run typecheck", "mise run lint:no-sync", "mise run lint:config-map"]
timeout_s = 1800
premises = ["file:tools/jj-ws/package.json", "file:tools/spec/jj-ws.md", "file:.ws.toml"]

[proposition]
id = "JJ-WS-RENAME"
claim = "`rr regex 'tools/workspace|@dotfiles/workspace'` finds no live reference outside .changes/CHANGELOG history; `ws --help` still works from the installed bin after `bun link` in the workspace; all gates pass"
refuted_by = "a remaining live reference to the old path or package, or a broken `ws` command"
+++

A pure rename: no behaviour change. Move the directory with a plain filesystem move (`mv tools/workspace tools/jj-ws`); do not run jj — land snapshots the tree and records it.
Add a patch changeset for the tool with `mise run changeset -- jj-ws patch "<entry>"` if the release lint needs it. Add
no sync calls. Do not rebase; land rebases. Record `mise run hook:pre-commit` exit code and last line in the checks field of
your JSON return. Test data outside the workspace. Do not commit or push.

## Current state (coordinator — single current version)
The rename is done in this workspace (tools/jj-ws, tools/spec/jj-ws.md, 14 files). Remaining: .ws.toml line 1 still says
"tools/workspace; spec: tools/spec/workspace.md" — update that comment (now in writes), rerun the gates and `ws --help`,
and finish. Do not redo the rename.

