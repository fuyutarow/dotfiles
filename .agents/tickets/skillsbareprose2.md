+++
schema = 2
name = "skillsbareprose2"
outcome = "every instruction an agent reads tells it to invoke in-house skills by their bare name (`/practicing-unix-philosophy`, Skill name `practicing-unix-philosophy`), describes delivery as bare-name copies installed by `mise run skills:sync` into ~/.claude/skills and ~/.agents/skills, and keeps `dotfiles:` only as the prefix of hook slugs (e.g. `dotfiles:reply-language`); no text mentions the retired dotfiles plugin or marketplace"
writes = ["CLAUDE.md", "agents/claude/CLAUDE.md", "agents/README.md", "agents/claude/README.md", "agents/commands/**", "agents/skills/**/*.md", "mise.toml"]
verify = ["mise run gate:land"]
timeout_s = 1500
premises = ["file:CLAUDE.md", "file:agents/claude/CLAUDE.md"]

[proposition]
id = "SKILLS-BARE-PROSE"
claim = "no agent-read text instructs invoking an in-house skill with the dotfiles: prefix or mentions the dotfiles plugin/marketplace"
refuted_by = "`rr regex 'dotfiles:<name>|local .dotfiles. plugin|dotfiles plugin|marketplace\\.json|dotfiles@dotfiles'` or an instruction like 'use `dotfiles:<skill>`' still matches in the writes"
+++

Facts (2026-10-15, alpha after skillsbare fbd80d97 and deploy): in-house skills are 57 bare-name copies in
~/.claude/skills; `claude plugin list` shows no dotfiles plugin; a fresh session sees `practicing-unix-philosophy`
once and `dotfiles:practicing-unix-philosophy` zero times. Calling Skill("dotfiles:<name>") now fails. Owner's rule:
invocation is the bare name; `dotfiles:` is an internal ID convention (hook slugs keep it).
Stale text found with rr:
- CLAUDE.md convention 3 ("Claude Code gets the local `dotfiles` plugin from .claude-plugin/marketplace.json"),
  6a ("skills:sync installs Claude's `dotfiles:<name>` skills"), 8 ("Claude Code invokes in-house skills as
  `dotfiles:<name>` … translate them to `dotfiles:<name>`"), Setup ("Claude plugin + Codex copies"), and skill
  references written as invocations: lines 149 `dotfiles:forging-skills`, 168 `dotfiles:renting-cloud-gpus`, 201
  `dotfiles:driving-jujutsu`, 227 `dotfiles:driving-git`.
- agents/claude/CLAUDE.md:46 "After compact, use `dotfiles:continuing-long-running-tasks`" (rendered into
  ~/.claude/CLAUDE.md; also its "In-house skill names" compact instruction).
- mise.toml (one match, likely the skills:sync description), agents/README.md, agents/commands/umada.md, koreo.md.
Do: rewrite each to the bare-name rule; state the rule once in CLAUDE.md convention 8; search agents/skills/**/*.md
for "translate … to dotfiles:" style instructions and fix them. Leave hook slugs (`dotfiles:<hook>` in hooks, settings,
tests) alone. Do not edit README.md (two other tickets are editing it; list its lines to change in your report).
Report every file changed and every match deliberately left with the reason. Do not commit or push.
