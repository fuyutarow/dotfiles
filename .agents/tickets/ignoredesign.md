+++
schema = 2
name = "ignoredesign"
outcome = "dotfiles' ignore rules are declared, anchored and checked: no dangling global excludes file; every generated path (tool caches, installs, runtime receipts) is ignored by a declared rule with its owner named; broad patterns are anchored to where they apply; secrets are guarded by a pre-commit scan rather than by ignore; a lint proves that no tracked file is ignored and that running the gate in a fresh clone leaves no untracked files"
writes = [".gitignore", "git/gitconfig", "git/ignore", "scripts/config-registry.ts", "scripts/lint-ignore.ts", "scripts/tests/lint-ignore.test.ts", "mise.toml", "tools/disk-reclaim/reclaim.toml", "tools/disk-reclaim/src/**", "tools/disk-reclaim/tests/**", "tools/*/.changes/*.md"]
verify = ["bun test scripts/tests/lint-ignore.test.ts", "mise run gate:land"]
timeout_s = 2400
premises = ["file:.gitignore", "file:git/gitconfig"]

[proposition]
id = "IGNORE-DECLARED"
claim = "every ignore rule in dotfiles has a declared source and owner, none hides a tracked file, and a fresh clone after `mise run gate:land` shows no untracked files"
refuted_by = "git/gitconfig points at an undeclared or missing excludes file, a tracked file matches an ignore rule, or a fresh-clone gate run leaves an untracked path"
+++

Owner asked (2026-10-15): "is .gitignore designed correctly?" Coordinator review (read-only) found:
1. git/gitconfig:15 `excludesfile = ~/.gitignore_global`; that file does not exist on this host and no row in
   scripts/config-registry.ts declares it (dangling, no writer).
2. Tool caches .rumdl_cache, .ruff_cache, .pytest_cache appear at the repo root but are not in .gitignore; they stay
   untracked only if each tool writes its own inner .gitignore (verify which do). The same list lives separately in
   tools/disk-reclaim/reclaim.toml (one concept, two lists).
3. Unanchored broad patterns: `local/`, `backups/`, `*.local`, `*.log`, `*.key`, `*.pem`, `.env` can hide legitimate
   files at any depth.
4. Secrets are "protected" only by ignore patterns.
5. Nothing checks the ignore set.
Do:
- Decide the global excludes: either declare a repo-owned file (e.g. git/ignore linked as ~/.config/git/ignore via a
  config-registry row, the git default path) and point core.excludesfile at it or drop the setting; justify.
- One list of regenerable paths: .gitignore entries for tool caches with an owner comment; make disk-reclaim read the
  same list (or generate one from the other) so they cannot drift.
- Anchor or remove broad patterns; for each, show what it is meant to cover and that nothing tracked matches.
- Secrets: add a pre-commit secret scan through the existing hook:pre-commit task if a scanner is already declared in
  Brewfile tiers (check; if none, report the candidate and do not add a dependency) and keep ignore only as a
  convenience.
- `lint:ignore` (in gate:land): fail if any tracked file is ignored; a test that clones the repo into a temp dir, runs
  a representative subset of gate tasks, and asserts no untracked files.
Do not run git (use jj); do not commit or push.

## Current state (coordinator agt_g67e, 2026-10-15 15:25)
Run f8845972 fixed the changeset; gate:land and tests then failed on lint:ignore's existing check/copy logic for the
consumer-repo path: presets (94eea82d) moved agents/skills/writing-typescript/assets/consumer-repo to presets/ (the old
path is a compatibility symlink). Fix lint:ignore and its tests for that (writes already include scripts/lint-ignore.ts
and its test); re-run verify with `MISE_TRUSTED_CONFIG_PATHS=$PWD MISE_STATE_DIR=$(mktemp -d)`.
