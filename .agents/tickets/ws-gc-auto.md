+++
schema = 2
name = "ws-gc-auto"
outcome = "finished workspaces are collected without a human: on 2026-10-16 the owner found ~80 stale dotfiles-ws-* / dotfiles-arm-agx-* directories because nothing ever runs `ws gc` (a manual run collected 42); make collection automatic at the two points where a workspace becomes collectable: (1) after a successful land (scripts/land.ts or the `mise run land`/commit path, whichever lands a worker workspace) run `ws gc` scoped to that workspace, logging its line; (2) a periodic sweep in the existing capacity timer path (scripts/wsl-capacity-recover.ts, or the self-heal unit) that runs `ws gc` for each registered repo store and logs collected/keep counts; both keep ws's safety rules (live, continuing, unlanded and unrecorded workspaces are kept)"
writes = ["scripts/land.ts", "scripts/tests/land*.test.ts", "scripts/wsl-capacity-recover.ts", "scripts/tests/wsl-capacity-recover*.test.ts", "mise.toml", "tools/*/.changes/*.md"]
verify = ["bun test scripts/tests/land.test.ts", "mise run lint:ts", "mise run typecheck", "mise run lint:no-sync"]
timeout_s = 2400
premises = ["file:scripts/land.ts", "file:scripts/wsl-capacity-recover.ts"]

[proposition]
id = "WS-GC-AUTO"
claim = "tests: a land of a fixture worker workspace whose run lineage is ended collects that workspace; a land never collects another live workspace; the periodic path calls `ws gc` once per run and logs counts; a failing `ws gc` is logged and does not fail the land or the capacity run"
refuted_by = "a finished, landed workspace left after land in the fixture, or any collection of a live or unlanded workspace"
+++

Another ticket (jj-ws-rename) is moving tools/workspace to tools/jj-ws; call the `ws` command, never import its source.
Add no sync calls. Do not rebase; land rebases. Record `mise run hook:pre-commit` exit code and last line in the checks
field of your JSON return. Test data outside the workspace. Do not commit or push.
