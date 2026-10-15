+++
schema = 2
name = "mise-contract-split"
outcome = "the shared mise-contract checker (agents/skills/wiring-mise-tasks/scripts/mise-contract.ts) covers what coralbase had to re-implement in /home/fuyu/Workspace/coralbase.ws/wave-a/scripts/tools-contract.ts: it reads task bodies from split task files (mise/tasks/*.toml and any task_config.includes), not only the root TOML's [tasks.*] (today mise-contract.ts:521 and :189), it checks that commands spawned by scripts and tests resolve through mise.toml [tools], a lockfile, or allowed OS base commands, its runtime detection is not limited to bun/deno/node/uv/julia/cargo (today :154), and it can require that task dirs live only under mise/tasks; coralbase's copy is the reference behaviour (read it, port the generic parts, leave coralbase-specific policy out as config)"
writes = ["agents/skills/wiring-mise-tasks/scripts/mise-contract.ts", "agents/skills/wiring-mise-tasks/tests/**", "agents/skills/wiring-mise-tasks/SKILL.md", "agents/skills/wiring-mise-tasks/references/**"]
verify = ["bun test agents/skills/wiring-mise-tasks", "mise run lint:ts", "mise run typecheck", "mise run lint:no-sync"]
timeout_s = 2700
premises = ["file:agents/skills/wiring-mise-tasks/scripts/mise-contract.ts"]

[proposition]
id = "MISE-CONTRACT-SPLIT"
claim = "fixtures: a split task file whose body calls an undeclared command fails; a script that spawns an undeclared tool fails; a runtime outside the old six is detected; dotfiles itself still passes `mise-contract`; running the new checker on a copy of coralbase wave-a gives the same verdicts as coralbase's tools-contract.ts (table of both in the return)"
refuted_by = "a split-task violation that passes, or a verdict difference from tools-contract.ts left unexplained"
+++

Read coralbase files read-only; never edit coralbase. Add no sync calls. Do not rebase; land rebases. Record `mise run
hook:pre-commit` exit code and last line in the checks field of your JSON return. Test data outside the workspace. Do not
commit or push.
