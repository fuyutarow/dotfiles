+++
schema = 2
name = "retros-retire"
outcome = "dotfiles no longer holds retrospectives (owner decision relayed by the retrospectives coordinator 2026-10-16: every retro lives in ~/Workspace/retrospectives, which already has byte-identical copies of agents/retros/2610-0a.md, 2610-0b.md and register.toml from 609acf879e5e): first confirm agents/retros is unchanged since 478b4f8dd556 (`jj diff --stat --from 478b4f8dd556 --to alpha 'root:\"agents/retros\"'`); if anything changed after 609acf879e5e, change nothing and return the diff; otherwise remove agents/retros/, scripts/retros-check.ts, scripts/retros-recur.ts, scripts/tests/retros-check.test.ts and the mise tasks retros:check and retros:recur (mise.toml:271-279), and repoint or remove every reference: README.md:45 (point to ~/Workspace/retrospectives/register.toml and say retros are written there), agents/skills/writing-bun-scripts/tests/cleye-corpus.test.ts:26-28, and any skill, hook or doc that names agents/retros or retros:*; skill test fixtures named postmortem-*.md under agents/skills/*/tests stay"
writes = ["agents/retros/**", "scripts/retros-check.ts", "scripts/retros-recur.ts", "scripts/tests/retros-check.test.ts", "mise.toml", "README.md", "agents/skills/**", "agents/hooks/**", "agents/claude/hooks/**", "scripts/config-registry.ts", "tools/*/.changes/*.md"]
verify = ["mise run lint:ts", "mise run typecheck", "mise run lint:config-map", "bun test agents/skills/writing-bun-scripts"]
timeout_s = 1800
premises = ["file:agents/retros/register.toml", "file:scripts/retros-check.ts"]

[proposition]
id = "RETROS-RETIRED"
claim = "the unchanged-since check output is in the return; after the change `rr regex 'agents/retros|retros:(check|recur)|retros-(check|recur)'` finds no reference outside .changes/CHANGELOG history; mise tasks list has no retros:*; gates pass"
refuted_by = "a deletion made although agents/retros changed after 609acf879e5e, or a remaining live reference"
+++

Do not edit any CLAUDE.md or agent memory file; if one references agents/retros, list it under for_coordinator instead
(the coordinator will raise it with the owner). Add no sync calls. Do not rebase; land rebases. Record `mise run
hook:pre-commit` exit code and last line in the checks field of your JSON return. Do not commit or push.
