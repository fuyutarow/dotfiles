+++
schema = 2
name = "nobash-msg"
outcome = "every no-new-bash message steers to replacing the shell with ONE Bun TypeScript file, never to splitting it: today agents/claude/hooks/enforce-no-new-bash.ts:122 ends with 'keep shell shims at most 12 lines', which reads as permission to split one long script into several short ones (owner question 2026-10-16); rewrite the deny and nudge texts (hook, the shared tools/shared/src/no-new-bash.ts reasons, and lint:bash) to say: write the logic as one .ts run by bun; a shell file is allowed only as a thin shim that execs it; splitting a script into several shell files is not a fix; and make lint:bash also fail when a single change adds two or more new shell files whose combined new lines exceed 12 (the split pattern)"
writes = ["agents/claude/hooks/enforce-no-new-bash.ts", "agents/claude/hooks/tests/**", "tools/shared/src/no-new-bash.ts", "tools/shared/tests/**", "scripts/lint-bash*.ts", "scripts/lint-no-new-bash*.ts", "scripts/tests/**", "agents/claude/README.md", "tools/*/.changes/*.md"]
verify = ["bun test agents/claude/hooks/tests", "mise run lint:ts", "mise run typecheck", "mise run lint:no-sync"]
timeout_s = 1800
premises = ["file:agents/claude/hooks/enforce-no-new-bash.ts", "file:tools/shared/src/no-new-bash.ts"]

[proposition]
id = "NOBASH-REPLACE-NOT-SPLIT"
claim = "no message text contains a phrase that allows splitting; tests assert the new text for the Write, Bash-redirect and unknown-size denies; a lint fixture where one change adds two 8-line .sh files fails, and one that adds a 5-line shim plus a .ts passes"
refuted_by = "any deny or nudge text that suggests several short shell files, or the split fixture passing"
+++

Find the lint task added by nobash-bash-route (daa3e7dc) with `mise tasks` before editing. Add no sync calls. Do not
rebase; land rebases. Record `mise run hook:pre-commit` exit code and last line in the checks field of your JSON return.
Test data outside the workspace. Do not commit or push.
