+++
schema = 2
name = "nobash-bash-route"
outcome = "the 12-line shell limit holds on every write route, not only Write/Edit: today agents/claude/hooks/enforce-no-new-bash.ts runs on PreToolUse Write|Edit|MultiEdit only (agents/claude/README.md:45 says 'Bash-written shell (cat > x.sh) is not covered'), and the coordinator confirmed on 2026-10-16 10:1x that a Bash `printf … > probe13.sh` created a 13-line .sh unhindered; add the Bash route (a PreToolUse Bash check that parses the command with the repo's Bash parser in tools/shared and denies a redirect, heredoc or tee whose target is a .sh/.bash file when the written content would exceed the limit, or when the size cannot be known before running, deny with the bun-ts advice) and a lint-side check that fails the commit gate when a tracked shell script over 12 lines is added or grows (covers codex workers and any route the hooks miss)"
writes = ["agents/claude/hooks/enforce-no-new-bash.ts", "agents/claude/hooks/tests/**", "agents/claude/settings.json", "agents/hooks/hooks.toml", "agents/claude/README.md", "scripts/lint-no-new-bash.ts", "scripts/tests/lint-no-new-bash*.test.ts", "mise.toml", "tools/shared/src/**", "tools/*/.changes/*.md"]
verify = ["bun test agents/claude/hooks/tests", "bun test scripts/tests/lint-no-new-bash.test.ts", "mise run lint:ts", "mise run typecheck", "mise run lint:no-sync"]
timeout_s = 2400
premises = ["file:agents/claude/hooks/enforce-no-new-bash.ts", "file:agents/claude/README.md"]

[proposition]
id = "NOBASH-EVERY-ROUTE"
claim = "hook tests: `printf '%s\\n' {1..13} > x.sh`, a 13-line heredoc to x.sh, and `tee x.sh` with 13 lines are denied; a 5-line heredoc to x.sh and writes to non-shell files pass; the lint fails on a fixture repo where a tracked .sh grows past 12 lines and passes on the real repo (existing legacy scripts grandfathered by not growing)"
refuted_by = "any 13-line shell write route that passes the hook, or the lint passing a grown script"
+++

Keep existing exemptions (vendored herdr header, `# shim: bootstrap`). Reuse tools/shared's Bash parsing (rr exists
before writing a parser). Wire the lint into the commit gate (hook:pre-commit) in mise.toml. Add no sync calls. Do not
rebase; land rebases. Record `mise run hook:pre-commit` exit code and last line in the checks field of your JSON return.
Test data outside the workspace. Do not commit or push.
