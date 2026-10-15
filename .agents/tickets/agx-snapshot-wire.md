+++
schema = 2
name = "agx-snapshot-wire"
outcome = "the agx:snapshot hook runs live: commit 735e922d added agents/claude/hooks/log-agx-snapshot.ts and its declaration (agents/hooks/hooks.toml:138-141, slug agx:snapshot) but registered it on no event, so the rendered ~/.claude/settings.json never calls it (only log-sys-snapshot.ts appears, at its Stop and PostToolUse entries); register log-agx-snapshot.ts on the same events as sys-snapshot in agents/claude/settings.json, and add a structural test that fails when any [[vendor_hook]] in agents/hooks/hooks.toml is referenced by no event in agents/claude/settings.json (or agents/codex/hooks.json for codex-only hooks), so a declared-but-unwired hook cannot land again"
writes = ["agents/claude/settings.json", "agents/hooks/tests/**", "agents/claude/hooks/tests/**", "scripts/tests/render-home*.test.ts"]
verify = ["bun test agents/hooks agents/claude/hooks/tests/log-agx-snapshot.test.ts", "bun test scripts/tests/render-home.test.ts", "mise run lint:ts", "mise run typecheck", "mise run lint:no-sync"]
timeout_s = 1800
premises = ["file:agents/claude/hooks/log-agx-snapshot.ts", "file:agents/hooks/hooks.toml", "file:agents/claude/settings.json"]

[proposition]
id = "AGX-SNAPSHOT-WIRED"
claim = "a fresh render (`bun scripts/render-home.ts` into a temp HOME, or its test) contains HOOK_SLUG=dotfiles:agx:snapshot … log-agx-snapshot.ts on Stop and PostToolUse; the new structural test fails on a fixture hooks.toml with an unregistered vendor_hook and passes on the real files"
refuted_by = "no agx:snapshot command in the rendered settings, or the structural test passing with an unregistered hook"
+++

Follow how sys-snapshot is registered (its command form `HOOK_SLUG=dotfiles:sys-snapshot sh ~/.claude/hooks/run.sh
log-sys-snapshot.ts`). The hook output must stay a systemMessage, never prompt context. If another declared hook is also
unregistered, list it in your return; fix only agx:snapshot. Add no sync calls. Do not rebase; land rebases. Record
`mise run hook:pre-commit` exit code and last line in the checks field of your JSON return. Test data outside the
workspace. Do not commit or push.
