+++
schema = 2
name = "nosync-u14"
outcome = "every node/no-sync violation in unit U14's files (74 at plan time) is gone: synchronous fs/child_process calls become their async forms, callers await them, and return values, callbacks and cleanup stay correct after the later units make their own APIs async"
writes = ["agents/skills/continuing-long-running-tasks/**/*.ts", "agents/claude/hooks/task-continuity.ts", "agents/codex/hooks/task-continuity.ts", "tools/*/.changes/*.md"]
verify = ["bunx --bun oxlint -A all -D node/no-sync agents/skills/continuing-long-running-tasks agents/claude/hooks/task-continuity.ts agents/codex/hooks/task-continuity.ts", "mise run typecheck", "bun test agents/skills/continuing-long-running-tasks", "mise run lint:ts"]
timeout_s = 2400
premises = ["file:agents/skills/continuing-long-running-tasks", "file:agents/claude/hooks/task-continuity.ts", "file:agents/codex/hooks/task-continuity.ts"]

[proposition]
id = "NOSYNC-U14"
claim = "oxlint node/no-sync reports zero diagnostics on U14's files, typecheck passes, and the unit's tests pass with unchanged behavior"
refuted_by = "a remaining node/no-sync diagnostic in the unit, a type error, a failing test, an un-awaited promise, or a sync disposer that no longer waits for its cleanup"
+++

Unit U14 of the accepted node/no-sync partition (plan run 5841ff4e). Plan rows that name U14, verbatim:
| U45 | `agents/claude/hooks/**/*.ts`、U01/U14 のアダプターと `repo-retrieve.ts` リンクを除く | 170 | Claude hooks、テスト | U01, U14 |
| U50 | `agents/codex/**/*.ts`、U01/U14 のアダプターを除く | 129 | Codex hooks/runtime CLI、テスト | U01, U14, U47 |
| continuation-record → compact-hook → Claude/Codex adapter | すべて U14。アダプターの `attempt` コールバックも非同期化する |
| shared stdin → platform lib → hooks | U01/U14/U45/U50 が先に await 対応し、U55 が後から同期読み込みを変える |
| `agents/skills/continuing-long-running-tasks/scripts/continuation-checkpoint.ts:113`、`:485` | `Symbol.dispose` は非同期 close を待たない。`await using`／`Symbol.asyncDispose` へ変える | U14 |
| 同ファイル `:406`、`:414` | `DisposableStack.defer` は非同期 unlink を待たない。非同期 cleanup stack 等へ変える | U14 |
Files (plan cell, verbatim): `SK/continuing-long-running-tasks/**/*.ts` ＋ `agents/{claude,codex}/hooks/task-continuity.ts`
Entry points: check/checkpoint CLI、両 hook、テスト. Depends on (must already be on alpha): —.
Abbreviations: SK=agents/skills, DR=tools/disk-reclaim, SH=tools/shared, P(a,b)=existing scripts/{a,b}.ts and
scripts/tests/{a,b}.test.ts. Where the cell says ただし…を除く (except …), do not edit the excluded files.
Rules from the plan: when you call a function owned by a LATER unit that is still sync, write the call so it stays
correct once it returns a Promise (await it; type with Awaited<ReturnType<…>>; accept async cleanup). Constructors,
sync iterators and Symbol.dispose cannot become async: change the calling pattern (factory, async iterator,
await using / Symbol.asyncDispose). Array.filter/some with async predicates do not wait: collect I/O first or loop.
Public APIs of tools with external consumers keep their Promise contract. A tool you change needs a patch changeset
(`MISE_TRUSTED_CONFIG_PATHS=$PWD MISE_STATE_DIR=$(mktemp -d) mise run changeset -- <tool> patch "<one line>"`).
Do not edit files outside writes; if a fix needs one, finish what you can and list it. Do not commit or push.

## Current state (coordinator, 00:38)
The previous run (67bfcefc) left this workspace with failing verify. Its first failing lines:
(fail) compact lifecycle adapters > Claude SessionStart injects only a locator, never record content [336.33ms]
Continue from the workspace as it stands: fix these without disabling rules, re-run verify. A failure in
"stale consumer link" is a known pre-existing test failure owned by another ticket; ignore only that one.
config-map findings on zero-byte sandbox placeholder files (.claude/launch.json and peers) are removed by the
coordinator before land; ignore only those. Test data outside the workspace. Do not commit or push.
