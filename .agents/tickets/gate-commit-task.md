+++
schema = 2
name = "gate-commit-task"
outcome = "one mise task `gate:commit` is the single definition of land's cheap commit checks (format check, lint:ts, lint:bun, typecheck — whatever hook:pre-commit (mise.toml:511) runs today besides tests), hook:pre-commit depends on it, scripts/land.ts runs it by name, and docs say a worker's verify should list `mise run gate:commit` so land never finds a lint/type failure the worker could have seen"
writes = ["mise.toml", "scripts/land.ts", "scripts/tests/land*.test.ts", "tools/spec/architecture.md", "tools/*/.changes/*.md"]
verify = ["mise run gate:commit", "bun test scripts/tests/land.test.ts", "mise run lint:ts", "mise run typecheck"]
timeout_s = 1800
premises = ["file:mise.toml", "file:scripts/land.ts"]

[proposition]
id = "GATE-COMMIT-ONE-HOME"
claim = "the checks run by land's commit step and by `mise run gate:commit` are the same list (a test reads both); removing a check from gate:commit removes it from land"
refuted_by = "a check that land runs at commit but gate:commit does not, or the reverse"
+++

Tonight land refused accepted work repeatedly for checks the worker never ran (try banned ×3, as-cast/JSON.parse,
typecheck ×1). Retro I-W4: one home for "what land checks". Keep land.ts changes minimal; if nosync-u08's conversion of
land.ts has landed, build on it. Test data outside the workspace. Do not commit or push.
