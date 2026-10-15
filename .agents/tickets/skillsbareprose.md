+++
schema = 2
name = "skillsbareprose"
outcome = "every instruction in the repo tells Claude Code to invoke in-house skills by their bare name (/<name>, Skill name <name>), and keeps `dotfiles:<name>` only as the internal ID convention; no text says the plugin delivers skills"
writes = ["CLAUDE.md", "README.md", "agents/README.md", "agents/claude/CLAUDE.md", "agents/claude/README.md", "agents/commands/**", "agents/skills/**/*.md"]
verify = ["mise run gate:land"]
timeout_s = 1500
premises = ["file:CLAUDE.md", "file:agents/claude/CLAUDE.md"]

[proposition]
id = "SKILLS-BARE-PROSE"
claim = "no repo text instructs invoking an in-house skill as dotfiles:<name> or describes the dotfiles plugin as the delivery route"
refuted_by = "`rr regex 'invoke[^\\n]*dotfiles:|dotfiles:<name>|local plugin|dotfiles@dotfiles'` finds an instruction that still prescribes the prefixed invocation or the plugin"
+++

Owner's decision (2026-10-15): in-house skills are invoked by bare name (`/practicing-unix-philosophy`, Skill tool
name `practicing-unix-philosophy`). `dotfiles:<name>` is only an internal ID convention (as in hook slugs like
`dotfiles:background-waits`), not the invocation name. Delivery: `skills:sync` copies them into ~/.claude/skills and
~/.agents/skills with `bunx skills add … --copy` (code change is ticket skillsbare, in parallel; do not edit scripts/).

Known loci (rr, 2026-10-15): CLAUDE.md (7 matches, incl. convention 3 "Claude Code gets the local dotfiles plugin",
convention 8 "Claude Code invokes in-house skills as dotfiles:<name>", the skills:sync bullet), agents/claude/CLAUDE.md
(1; it feeds the rendered ~/.claude/CLAUDE.md "Compact instructions" block), agents/claude/README.md (2),
agents/README.md (1), README.md (1), agents/commands/{koreo,umada,AA}.md, agents/skills/operating-the-harness/
references/commands-and-skills.md, agents/skills/forging-skills/SKILL.md, and any skill body saying "translate to
dotfiles:<name> when invoking a sibling". Hook slugs (`dotfiles:<hook>` in agents/claude/hooks, agents/codex,
settings.json, tests) are the internal convention: leave them.
Do: rewrite each instruction to the bare-name rule; state once (CLAUDE.md convention 8 and README) that
`dotfiles:<name>` is the internal ID and the invocation is bare. Report every file changed and every match you
deliberately left, with the reason. Do not commit or push.
