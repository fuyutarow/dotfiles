+++
schema = 2
name = "nn-3"
outcome = "every non-null assertion (`x!`, oxlint typescript/no-non-null-assertion) in these files is replaced by real narrowing (an explicit check that handles the missing case, a zod parse at the boundary, or a type that cannot be undefined) with behaviour unchanged: tools/disk-reclaim/src/delete.ts, tools/disk-reclaim/src/targets/host.ts, tools/disk-reclaim/tests/cli-integration.test.ts, tools/disk-reclaim/tests/cli.test.ts, tools/disk-reclaim/tests/engine.test.ts, tools/disk-reclaim/tests/targets/b-vhdx.test.ts, tools/disk-reclaim/tests/targets/c-workspaces.test.ts, tools/disk-reclaim/tests/targets/d-tmpfs.test.ts, tools/disk-reclaim/tests/targets/tree-cache.test.ts"
writes = ["tools/disk-reclaim/src/delete.ts", "tools/disk-reclaim/src/targets/host.ts", "tools/disk-reclaim/tests/cli-integration.test.ts", "tools/disk-reclaim/tests/cli.test.ts", "tools/disk-reclaim/tests/engine.test.ts", "tools/disk-reclaim/tests/targets/b-vhdx.test.ts", "tools/disk-reclaim/tests/targets/c-workspaces.test.ts", "tools/disk-reclaim/tests/targets/d-tmpfs.test.ts", "tools/disk-reclaim/tests/targets/tree-cache.test.ts", "tools/*/.changes/*.md"]
verify = ["mise run lint:ts", "mise run typecheck", "mise run lint:no-sync"]
timeout_s = 1800
premises = ["file:tools/disk-reclaim/src/delete.ts", "file:tools/disk-reclaim/src/targets/host.ts", "file:tools/disk-reclaim/tests/cli-integration.test.ts", "file:tools/disk-reclaim/tests/cli.test.ts", "file:tools/disk-reclaim/tests/engine.test.ts", "file:tools/disk-reclaim/tests/targets/b-vhdx.test.ts", "file:tools/disk-reclaim/tests/targets/c-workspaces.test.ts", "file:tools/disk-reclaim/tests/targets/d-tmpfs.test.ts", "file:tools/disk-reclaim/tests/targets/tree-cache.test.ts"]

[proposition]
id = "NN-3-NO-NONNULL"
claim = "`bunx --bun oxlint -A all -D typescript/no-non-null-assertion` on the listed files reports 0; their tests pass; no new sync call"
refuted_by = "a remaining `!` assertion in a listed file, a changed behaviour, or a failing test"
+++

Part of making typescript/no-non-null-assertion an error in the typescript preset (requested by coralbase, owner decision
2026-10-16). The rule itself is turned on by a later ticket once all units land; do not edit presets/ or .oxlintrc.json.
Do not use `as`, `<T>`, @ts-ignore or @ts-expect-error (also banned). Run the listed files' own tests. You cannot rebase
in the sandbox; land rebases. Definition of done: `mise run hook:pre-commit` exits 0; record its exit code and last line
in the checks field of your JSON return. Test data outside the workspace. Do not commit or push.
