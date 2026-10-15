+++
schema = 2
name = "agx-snapshot-hook"
outcome = "a new vendor hook `dotfiles:agx-snapshot`, built exactly like `dotfiles:sys-snapshot` (agents/claude/hooks/log-sys-snapshot.ts): on Stop, and on PostToolUse at most once per minute per session, it attaches one `systemMessage` line describing this session's agx fleet at that moment, e.g. `Agx: 3 running · 2 ended-unjudged · orphaned 1 | herdr-btm luna-high 4m working · statusline-design opus-medium 12m working`, so a transcript shows when each worker started, ended and was judged; it reads the snapshot the statusline already reads (tools/statusline/src/agx-snapshot.ts / readAgxSnapshotAsync) and never samples or runs `agx ls` itself; a stale or missing snapshot means no line (a log, never a gate: fail-open, exit 0); it is registered in agents/hooks/hooks.toml next to sys-snapshot and wired by the existing render (`mise run link:dots`)"
writes = ["agents/claude/hooks/log-agx-snapshot.ts", "agents/claude/hooks/tests/log-agx-snapshot*.test.ts", "agents/hooks/hooks.toml", "agents/hooks/tests/**", "tools/*/.changes/*.md"]
verify = ["bun test agents/claude/hooks/tests", "bun test agents/hooks/tests", "mise run lint:ts", "mise run lint:bun", "mise run lint:one-writer"]
timeout_s = 1800
premises = ["file:agents/claude/hooks/log-sys-snapshot.ts", "file:agents/hooks/hooks.toml", "file:tools/statusline/src/agx-snapshot.ts"]

[proposition]
id = "AGX-SNAPSHOT-HOOK"
claim = "fixtures: a Stop payload with a fresh agx snapshot holding this session's runs emits one systemMessage line with counts and one compact entry per running run; a second PostToolUse within 60 s emits nothing; a stale or missing snapshot, or another session's runs only, emits nothing and exits 0; the hook never spawns agx"
refuted_by = "a line built from a second measurement path, a hook that blocks or fails a tool call, or a line that includes other sessions' runs as this session's"
+++

Owner request 2026-10-16: "dotfiles:sys-snapshot のほかに dotfiles:agx:snapshot のようなものがほしい（hook の話）". Slug naming:
existing slugs are flat kebab (`sys-snapshot`, `reply-language`), so use `agx-snapshot` unless the hook registry allows a
namespaced slug; say which in your return. Mirror log-sys-snapshot.ts's channel (systemMessage: recorded in the transcript,
shown to the user, not added to model context), cadence and fail-open rules. Attribution: this session = the payload's
session_id matched against each run's dispatcher_session. Do not edit tools/statusline (ticket statusline-design owns it);
if the snapshot lacks a field you need, report it instead of adding a sampler. Test data outside the workspace.
Do not commit or push.
