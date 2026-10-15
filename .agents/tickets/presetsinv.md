+++
schema = 2
name = "presetsinv"
outcome = "a read-only inventory of every repository under /home/fuyu/Workspace (primary checkouts only, not *-arm-*, *.ws, backups) that consumes dotfiles' project configuration: tsconfig, oxlint policy (oxlint-policy.local.toml, .oxlintrc.json), mise task templates, textlint config, Cargo/clippy/rustfmt, and any path into ~/dotfiles or ~/.claude/skills; per repo, the file, how it was obtained (copy, extends/path reference, rendered), and its drift from dotfiles' current source"
writes = []
verify = []
timeout_s = 1200
premises = ["file:oxlint-policy.toml"]

[proposition]
id = "PRESETS-CONSUMERS"
claim = "the inventory lists every primary repo under ~/Workspace with a dotfiles-derived config and how it consumes it"
refuted_by = "a primary repo under ~/Workspace has a config file referencing or copied from dotfiles that the inventory omits"
+++

Context: dotfiles is moving its project-configuration presets (TypeScript tsconfig, oxlint policy first; later mise
task templates, textlint, Rust) into a top-level presets/ directory (ticket presets, in parallel). Before anything
consumers depend on is moved, we need the consumers (retro 2026-10-14, C1).
Sources in dotfiles today: oxlint-policy.toml (root), .oxlintrc.json (rendered), tsconfig.json (root),
agents/skills/writing-typescript/assets/consumer-repo/*, agents/skills/wiring-mise-tasks/templates/*.mise.toml,
agents/skills/linting-prose/assets/textlintrc*.json.
Known consumer: /home/fuyu/Workspace/coralbase. Others likely: Coral-dpp, QOED, QINotebook, firedancer, admission.
Do, read-only:
1. List primary repos (skip names containing -arm-, .ws, backup, broken, corrupt).
2. In each, find config files of the kinds above and any text referencing `dotfiles`, `oxlint-policy`, `.claude/skills`
   or the skill names wiring-mise-tasks / writing-typescript / linting-prose. Use `rr` where the repo is
   ccc-registered; lexical routes (`rr text|regex|files`) do not need the ccc index.
3. For each hit, diff against the dotfiles source and classify: copy (in sync / drifted), path reference, rendered.
Return a table (repo, file, source in dotfiles, mechanism, drift summary) and the list of path references that would
break if the source moved. Write nothing anywhere.
