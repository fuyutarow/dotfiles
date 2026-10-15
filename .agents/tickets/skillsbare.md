+++
schema = 2
name = "skillsbare"
outcome = "in-house skills reach Claude Code as bare-name copies in ~/.claude/skills/<name> (invoked /<name>), installed by `bunx skills add <repo>/agents/skills -g -a claude-code --copy`, alongside the existing Codex copies; the local plugin `dotfiles` is retired (marketplace manifest, plugin install code, settings entries); skills:sync is transactional (install and verify new copies before removing anything) and touches in-house names only; doctor FAILs when an in-house skill is missing, stale, duplicated as a plugin, or a symlink"
writes = [".claude-plugin/**", "scripts/skills-*.ts", "scripts/tests/skills-*.ts", "scripts/tests/fake-claude-plugin.ts", "scripts/tests/doctor.test.ts", "scripts/doctor.ts", "scripts/render-home.ts", "scripts/lint-skills-index.ts", "scripts/config-registry.ts", "agents/claude/settings.json", "mise.toml"]
verify = ["bun test scripts/tests/skills-sync.test.ts scripts/tests/skills-doctor.test.ts", "bunx --bun tsgo --noEmit", "mise run lint:one-writer", "mise run gate:land"]
timeout_s = 2400
premises = ["file:scripts/skills-sync.ts", "task:skills:sync", "task:gate:land"]

[proposition]
id = "SKILLS-BARE"
claim = "after skills:sync in a throwaway HOME, a fresh Claude Code session lists every in-house skill once, under its bare name, and no dotfiles:<name> plugin skill exists"
refuted_by = "a test HOME after sync lacks ~/.claude/skills/<name> as a real directory for some in-house skill, has it as a symlink, still has the dotfiles plugin installed or enabled, or a sync that fails midway has removed existing copies"
+++

Owner's decision (2026-10-15), correcting 2026-10-14's reading: in-house skills are invoked by their bare name
(`/practicing-unix-philosophy`). `dotfiles:<name>` is only an internal ID convention used in prose, hook slugs and
docs, never the invocation name. Claude Code plugin skills are always namespaced `/<plugin>:<skill>`, so the plugin
route of d4079e8f cannot deliver bare names and is retired.

Live state now (coordinator, measured):
- The coordinator already ran `bunx skills add /home/fuyu/dotfiles/agents/skills -g -a claude-code -s '*' --copy -y`:
  57 of 57 in-house skills are real directories in ~/.claude/skills, and the live session lists them by bare name.
  `claude plugin disable dotfiles@dotfiles` was run to stop duplicates.
- ~/.agents/skills holds the 57 Codex copies (unchanged).
- ~/.claude/skills also holds third-party and personal skills, some as symlinks into OTHER repos
  (transcribing-line-talks, fuchu-ippatsu-menkyo, courting-on-apps, profiling-personality). Sync must not touch them.
- Code to retire or rewrite: scripts/skills-plugin.ts (20 refs), scripts/skills-sync.ts (24), scripts/tests/
  fake-claude-plugin.ts, scripts/tests/skills-plugin.test.ts, .claude-plugin/marketplace.json, scripts/
  lint-skills-index.ts (4 marketplace refs), scripts/config-registry.ts (1), agents/claude/settings.json (1).

Do:
1. skills:sync installs in-house skills for Claude with the same CLI form as Codex, `-a claude-code --copy`
   (use the pinned `bunx --bun --yes skills@<version>` already used for Codex). Order: install into place, verify each
   target is a real directory whose SKILL.md matches the repo, then remove in-house copies whose names no longer exist
   in agents/skills. Never remove a name that is not an in-house name. Add a test where install fails midway and
   existing copies survive.
2. Retire the plugin: delete the marketplace manifest and plugin code and tests; sync uninstalls `dotfiles@dotfiles`
   if present (idempotent); render-home carries no extraKnownMarketplaces.dotfiles or enabledPlugins entry for it.
3. doctor: per in-house name, FAIL if ~/.claude/skills/<name> or ~/.agents/skills/<name> is missing, a symlink, or its
   SKILL.md differs from the repo; FAIL if the dotfiles plugin is installed. Each FAIL names `mise run skills:sync`.
4. Task description of skills:sync says what it now does. Remove skills:migrate if nothing uses it (show the rr
   evidence); otherwise leave it.
Prose (CLAUDE.md, README, agents/**/*.md, skill bodies) is ticket skillsbareprose, running in parallel. Do not edit
those files. Work in a throwaway HOME; do not run sync, deploy or link:dots against the real HOME. Do not commit or
push.

## Current state (coordinator, 2026-10-15 13:40)
Run f3c5c812 is accepted (all verifies 0). `mise run land skillsbare` failed only at rebase:
"rebase introduced conflicts: [scripts/tests/doctor.test.ts]" (alpha gained helperbins e1a036b7 and tmpbytes-era
doctor tests). Rebase this workspace onto alpha (`jj rebase -d alpha` in this workspace only), resolve the conflict
keeping both sides' tests, re-run the verify commands, change nothing else.
