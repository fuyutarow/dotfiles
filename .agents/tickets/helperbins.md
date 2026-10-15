+++
schema = 2
name = "helperbins"
outcome = "every skill script that repos or dotfiles call as a command is a package.json bin on PATH (jj-commit, fmt-staged, mise-contract, …); templates, skills and dotfiles scripts call the bin, never a ~/.claude/skills/... path; doctor FAILs when a registered repo's mise.toml calls a helper that does not resolve"
writes = ["package.json", "bun.lock", "agents/skills/**", "scripts/**", "tools/**/.changes/*.md", "README.md", "CLAUDE.md", "mise.toml"]
verify = ["bun test scripts/tests", "bunx --bun tsgo --noEmit", "mise run gate:land"]
timeout_s = 2400
premises = ["file:agents/skills/wiring-mise-tasks/scripts/jj-commit.ts", "file:scripts/repos-audit.ts", "task:gate:land"]

[proposition]
id = "HELPER-ON-PATH"
claim = "a repo's mise task reaches each dotfiles helper by a bin name on PATH, so the skills install layout can change without breaking any repo"
refuted_by = "after `bun link`, `command -v jj-commit` fails, or `rr regex '~/.claude/skills/[a-z-]+/scripts'` still finds a caller in agents/skills or scripts, or doctor passes on a fixture repo whose mise.toml calls a missing ~/.claude/skills/... path"
+++

Regression: d4079e8f moved in-house skills from ~/.claude/skills/<name> symlinks to the Claude plugin. That broke every
caller that ran a skill script by path. Examples:
- firedancer's `mise run commit` runs `bun ~/.claude/skills/wiring-mise-tasks/scripts/jj-commit.ts`. The file is gone,
  so no commit is possible.
- In dotfiles: scripts/repos-audit.ts:10 (wiring-repositories/scripts/wiring-check.ts), every
  agents/skills/wiring-mise-tasks/templates/*.mise.toml (fmt-staged.ts, mise-contract.ts, jj-commit.ts), and
  wiring-mise-tasks/SKILL.md:215, continuing-long-running-tasks/SKILL.md:143 (continuation-check.ts).

Do:
1. Inventory every script called through a ~/.claude/skills/ or ~/.agents/skills/ path:
   `rr regex '\.(claude|agents)/skills/[a-z-]+/scripts'`. Also check the other registered repos' mise.toml files. Find
   the registry from repos-audit / wiring-repositories; read only.
2. Expose each as a bin in the root package.json, so `bun link` (mise run deps) installs it in ~/.bun/bin. Use stable
   kebab names: jj-commit, jj-push, jj-precommit, fmt-staged, mise-contract, wiring-check, continuation-check, and any
   others the inventory finds. Add a `#!/usr/bin/env bun` shebang where one is missing. Scripts that import siblings
   must still resolve them.
3. Rewrite the templates, SKILL.md files and scripts/repos-audit.ts to call the bin name.
4. Add a doctor check: for each registered repo, FAIL if a mise.toml task runs a ~/.claude/skills/... or
   ~/.agents/skills/... path that does not exist. The repair names the bin. Add a fixture test.
5. Add a repo lint (inside gate:land) that FAILs if a new skill-internal script path appears in agents/skills
   templates or scripts.
Do not edit other repos. Do not run deps/link against the real HOME. The coordinator does that and notifies
firedancer. Do not commit or push.

## Current state (coordinator, 2026-10-15)
Rule (unchanged): PATH bins are the interface for OTHER repos only; inside dotfiles every task, gate, lint, script
and test calls helpers by repo-relative path; templates and SKILL.md instructions for other repos and the doctor
check keep the bin names. Run 2e699872 implemented this. Its verify failures (8 "script-check floor" tests,
lint-skills-floor) were /tmp ENOSPC at the time (tmpfs was 100%; it is 58% now). Do not change code for them:
re-run `bun test scripts/tests`, then `env PATH=<PATH without ~/.bun/bin> mise run gate:land`, and report both exits
verbatim. Fix only failures that remain and are caused by your diff. The production Cleye corpus test failure is
owned by ticket cleyecorpus; leave it.
