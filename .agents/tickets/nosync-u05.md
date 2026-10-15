+++
schema = 2
name = "nosync-u05"
outcome = "every node/no-sync violation in unit U05's files (45 at plan time) is gone: synchronous fs/child_process calls become their async forms, callers await them, and return values, callbacks and cleanup stay correct after the later units make their own APIs async"
writes = ["tools/disk-reclaim/tests/jj/fixture.ts", "tools/disk-reclaim/tests/cli-integration.test.ts", "tools/disk-reclaim/tests/targets/c-workspaces.test.ts", "tools/*/.changes/*.md"]
verify = ["bunx --bun oxlint -A all -D node/no-sync tools/disk-reclaim/tests/jj/fixture.ts tools/disk-reclaim/tests/cli-integration.test.ts tools/disk-reclaim/tests/targets/c-workspaces.test.ts", "mise run typecheck", "bun test tools/disk-reclaim/tests/jj/fixture.ts", "bun test tools/disk-reclaim/tests/cli-integration.test.ts", "bun test tools/disk-reclaim/tests/targets/c-workspaces.test.ts", "mise run lint:ts"]
timeout_s = 2400
premises = ["file:tools/disk-reclaim/tests/jj/fixture.ts", "file:tools/disk-reclaim/tests/cli-integration.test.ts", "file:tools/disk-reclaim/tests/targets/c-workspaces.test.ts"]

[proposition]
id = "NOSYNC-U05"
claim = "oxlint node/no-sync reports zero diagnostics on U05's files, typecheck passes, and the unit's tests pass with unchanged behavior"
refuted_by = "a remaining node/no-sync diagnostic in the unit, a type error, a failing test, an un-awaited promise, or a sync disposer that no longer waits for its cleanup"
+++

Unit U05 of the accepted node/no-sync partition (plan run 5841ff4e; full plan: /home/fuyu/.cache/coord/nosync-units.md, read its
rules section and the "confirmed boundaries" table for rows naming U05).
Files (plan cell, verbatim): `DR/tests/jj/fixture.ts`、`DR/tests/cli-integration.test.ts`、`DR/tests/targets/c-workspaces.test.ts`
Entry points: `World` を生成するテスト. Depends on (must already be on alpha): —.
Abbreviations: SK=agents/skills, DR=tools/disk-reclaim, SH=tools/shared, P(a,b)=existing scripts/{a,b}.ts and
scripts/tests/{a,b}.test.ts. Where the cell says ただし…を除く (except …), do not edit the excluded files.
Rules from the plan: when you call a function owned by a LATER unit that is still sync, write the call so it stays
correct once it returns a Promise (await it; type with Awaited<ReturnType<…>>; accept async cleanup). Constructors,
sync iterators and Symbol.dispose cannot become async: change the calling pattern (factory, async iterator,
await using / Symbol.asyncDispose). Array.filter/some with async predicates do not wait: collect I/O first or loop.
Public APIs of tools with external consumers keep their Promise contract. A tool you change needs a patch changeset
(`MISE_TRUSTED_CONFIG_PATHS=$PWD MISE_STATE_DIR=$(mktemp -d) mise run changeset -- <tool> patch "<one line>"`).
Do not edit files outside writes; if a fix needs one, finish what you can and list it. Do not commit or push.

## Current state (coordinator, 08:20)
The previous run (4f36d828) left this workspace with failing verify. Its first failing lines:
(fail) --fetch is off by default, works on plan and blind run, and fetch failure yields ASK [900.48ms]
(pass) workspaces target > a conflicted working-copy commit is KEEP [494.93ms]
Continue from the workspace as it stands: fix these without disabling rules, re-run verify. A failure in
"stale consumer link" is a known pre-existing test failure owned by another ticket; ignore only that one.
config-map findings on zero-byte sandbox placeholder files (.claude/launch.json and peers) are removed by the
coordinator before land; ignore only those. Test data outside the workspace. Do not commit or push.
