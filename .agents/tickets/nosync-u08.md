+++
schema = 2
name = "nosync-u08"
outcome = "every node/no-sync violation in unit U08's files (278 at plan time) is gone: synchronous fs/child_process calls become their async forms, callers await them, and return values, callbacks and cleanup stay correct after the later units make their own APIs async"
writes = ["scripts/agx-accept.ts", "scripts/tests/agx-accept.test.ts", "scripts/land.ts", "scripts/tests/land.test.ts", "scripts/land-queue.ts", "scripts/tests/land-queue.test.ts", "scripts/land-changesets.ts", "scripts/tests/land-changesets.test.ts", "scripts/hook-post-commit.ts", "scripts/tests/hook-post-commit.test.ts", "scripts/post-merge.ts", "scripts/tests/post-merge.test.ts", "scripts/precommit-jj.ts", "scripts/tests/precommit-jj.test.ts", "scripts/gate-land.ts", "scripts/tests/gate-land.test.ts", "scripts/changeset.ts", "scripts/tests/changeset.test.ts", "scripts/lint-changesets.ts", "scripts/tests/lint-changesets.test.ts", "scripts/land-doctor.ts", "scripts/tests/land-doctor.test.ts", "scripts/land-verdict.ts", "scripts/tests/land-verdict.test.ts", "tools/*/.changes/*.md"]
verify = ["bunx --bun oxlint -A all -D node/no-sync scripts/agx-accept.ts scripts/tests/agx-accept.test.ts scripts/land.ts scripts/tests/land.test.ts scripts/land-queue.ts scripts/land-changesets.ts scripts/tests/land-changesets.test.ts scripts/hook-post-commit.ts scripts/post-merge.ts scripts/tests/post-merge.test.ts scripts/tests/precommit-jj.test.ts scripts/tests/gate-land.test.ts scripts/changeset.ts scripts/tests/changeset.test.ts scripts/lint-changesets.ts scripts/land-doctor.ts scripts/land-verdict.ts scripts/tests/land-verdict.test.ts", "mise run typecheck", "bun test scripts/tests/agx-accept.test.ts", "bun test scripts/tests/land.test.ts", "bun test scripts/tests/land-changesets.test.ts", "bun test scripts/tests/post-merge.test.ts", "mise run lint:ts"]
timeout_s = 2400
premises = ["file:scripts/agx-accept.ts", "file:scripts/tests/agx-accept.test.ts", "file:scripts/land.ts"]

[proposition]
id = "NOSYNC-U08"
claim = "oxlint node/no-sync reports zero diagnostics on U08's files, typecheck passes, and the unit's tests pass with unchanged behavior"
refuted_by = "a remaining node/no-sync diagnostic in the unit, a type error, a failing test, an un-awaited promise, or a sync disposer that no longer waits for its cleanup"
+++

Unit U08 of the accepted node/no-sync partition (plan run 5841ff4e). Plan rows that name U08, verbatim:
| U53 | `P(config-map,config-registry,hook-registry,link-agent-assets,link-dots,one-writer-check,render-home)` | 273 | link/render/map CLI、テスト | U08, U47, U48 |
| U58 | `SK/wiring-mise-tasks/{scripts,tests}/jj-*.ts` | 83 | jj-commit/precommit/push、テスト | U08, U09, U21, U48, U53 |
| U73 | `SH/{src/dir-lock.ts,tests/dir-lock.test.ts}` | 17 | acquire/tryAcquire/release API、テスト | U08, U46, U51, U68 |
| dir-lock → release disposer | U08/U46/U51/U68 が先に非同期 cleanup を受けられる形へ変え、U73 が後 |
Files (plan cell, verbatim): `P(agx-accept,land,land-queue,land-changesets,hook-post-commit,post-merge,precommit-jj,gate-land,changeset,lint-changesets,land-doctor,land-verdict)`
Entry points: land/accept CLI、hook、テスト. Depends on (must already be on alpha): —.
Abbreviations: SK=agents/skills, DR=tools/disk-reclaim, SH=tools/shared, P(a,b)=existing scripts/{a,b}.ts and
scripts/tests/{a,b}.test.ts. Where the cell says ただし…を除く (except …), do not edit the excluded files.
Rules from the plan: when you call a function owned by a LATER unit that is still sync, write the call so it stays
correct once it returns a Promise (await it; type with Awaited<ReturnType<…>>; accept async cleanup). Constructors,
sync iterators and Symbol.dispose cannot become async: change the calling pattern (factory, async iterator,
await using / Symbol.asyncDispose). Array.filter/some with async predicates do not wait: collect I/O first or loop.
Public APIs of tools with external consumers keep their Promise contract. A tool you change needs a patch changeset
(`MISE_TRUSTED_CONFIG_PATHS=$PWD MISE_STATE_DIR=$(mktemp -d) mise run changeset -- <tool> patch "<one line>"`).
Do not edit files outside writes; if a fix needs one, finish what you can and list it. Do not commit or push.

## Current state (coordinator, 01:4x — single current version)
Your change was accepted; land's rebase onto alpha conflicted in scripts/land-queue.ts, scripts/land.ts, scripts/tests/land.test.ts: alpha gained land-follow (a2c544b7: after land the main checkout follows alpha and reports LIVE/NOT LIVE) and other land changes. Rebase your change onto alpha (`jj rebase -d alpha` on your own change only), redo your sync→async conversion on the new text by meaning, keep alpha's behaviour, and re-run verify plus `mise run lint:ts` and `mise run lint:bun`.
Ignore config-map findings on zero-byte sandbox placeholder files. Test data outside the workspace. Do not commit or push.
