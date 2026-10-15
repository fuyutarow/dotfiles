+++
schema = 2
name = "ws-sole-creator"
outcome = "`ws add` is the only way an agent creates a workspace, in every repo: the owner has asked repeatedly (2026-10-16: 'いつになったら {project}.ws/ws_{slug} に完全移行できるんだよ　ずっと言ってるぞ') and ~/ and ~/Workspace still hold ~120 legacy siblings (<repo>-arm-*, <repo>-ws-*) because each project's coordinator creates workspaces with its own scripts calling `jj workspace add` / `git worktree add`; add a PreToolUse Bash hook (Claude route, via agents/hooks/hooks.toml and agents/claude/settings.json) and the equivalent Codex hook entry that denies a command running `jj workspace add` or `git worktree add` directly, with the message `use: ws add <slug> --repo <repo>  (creates <repo>.ws/ws_<slug>; tools/spec/jj-ws.md)`; `ws` itself runs jj as a child process, so it is unaffected; parse with tools/shared's Bash parser (no regex on raw strings); also deny a Write/Edit that creates a script containing those commands outside tools/jj-ws"
writes = ["agents/claude/hooks/enforce-ws-sole-creator.ts", "agents/claude/hooks/tests/**", "agents/hooks/hooks.toml", "agents/claude/settings.json", "agents/codex/hooks.json", "agents/claude/README.md", "tools/shared/src/**", "tools/*/.changes/*.md"]
verify = ["bun test agents/claude/hooks/tests", "bun test agents/hooks", "mise run lint:ts", "mise run typecheck", "mise run lint:no-sync"]
timeout_s = 2400
premises = ["file:agents/hooks/hooks.toml", "file:tools/spec/jj-ws.md"]

[proposition]
id = "WS-SOLE-CREATOR"
claim = "hook tests: `jj workspace add ../x`, `jj -R repo workspace add --name y ../y`, `git worktree add ../z` and the same inside `bash -c '…'` are denied with the ws message; `ws add foo --repo /r`, `jj workspace list`, `jj workspace forget` pass; a script file written with `jj workspace add` outside tools/jj-ws is denied; the declared-hook structural test (7531f39f) passes with the new hook registered; after deploy a live probe in this session (`jj workspace add /tmp/x`) is denied"
refuted_by = "any direct workspace-creation form that passes, or `ws` itself blocked"
+++

Add no sync calls. Do not rebase; land rebases. Record `mise run hook:pre-commit` exit code and last line in the checks
field of your JSON return. Test data outside the workspace. Do not commit or push.
