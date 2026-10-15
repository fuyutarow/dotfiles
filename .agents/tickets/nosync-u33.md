+++
schema = 2
name = "nosync-u33"
outcome = "every node/no-sync violation in unit U33's files (29 at plan time) is gone: synchronous fs/child_process calls become their async forms, callers await them, and return values, callbacks and cleanup stay correct after the later units make their own APIs async"
writes = ["agents/skills/writing-bun-scripts/**/*.ts", "tools/*/.changes/*.md"]
verify = ["bunx --bun oxlint -A all -D node/no-sync agents/skills/writing-bun-scripts", "mise run typecheck", "bun test agents/skills/writing-bun-scripts", "mise run lint:ts"]
timeout_s = 2400
premises = ["file:agents/skills/writing-bun-scripts"]

[proposition]
id = "NOSYNC-U33"
claim = "oxlint node/no-sync reports zero diagnostics on U33's files, typecheck passes, and the unit's tests pass with unchanged behavior"
refuted_by = "a remaining node/no-sync diagnostic in the unit, a type error, a failing test, an un-awaited promise, or a sync disposer that no longer waits for its cleanup"
+++

Unit U33 of the accepted node/no-sync partition (plan run 5841ff4e). Plan rows that name U33, verbatim:
(none beyond the files row)
Files (plan cell, verbatim): `SK/writing-bun-scripts/**/*.ts`
Entry points: script-check CLI、テスト. Depends on (must already be on alpha): —.
Abbreviations: SK=agents/skills, DR=tools/disk-reclaim, SH=tools/shared, P(a,b)=existing scripts/{a,b}.ts and
scripts/tests/{a,b}.test.ts. Where the cell says ただし…を除く (except …), do not edit the excluded files.
Rules from the plan: when you call a function owned by a LATER unit that is still sync, write the call so it stays
correct once it returns a Promise (await it; type with Awaited<ReturnType<…>>; accept async cleanup). Constructors,
sync iterators and Symbol.dispose cannot become async: change the calling pattern (factory, async iterator,
await using / Symbol.asyncDispose). Array.filter/some with async predicates do not wait: collect I/O first or loop.
Public APIs of tools with external consumers keep their Promise contract. A tool you change needs a patch changeset
(`MISE_TRUSTED_CONFIG_PATHS=$PWD MISE_STATE_DIR=$(mktemp -d) mise run changeset -- <tool> patch "<one line>"`).
Do not edit files outside writes; if a fix needs one, finish what you can and list it. Do not commit or push.

## Current state (coordinator, 22:15)
Your accepted change was rejected by land's commit gate (or rebase). First lines from the land log:
[land] preflight: ok land tree is clean; workspace is non-empty and conflict-free
[land] commit: FAIL mise exited 1
[land] summary: FAIL commit=none commit=failed push=pending
floor: FAIL=0 WARN=0 (files=1) — structure only; BG1-BG4 judgment is not covered
agents/skills/writing-bun-scripts/tests/script-check.test.ts:63:27: error typescript(no-misused-promises): Promise returned in function argument where a void return was expected.
agents/skills/writing-bun-scripts/tests/script-check.test.ts:63:30: error typescript(strict-void-return): Value returned in a context where a void return is expected.
agents/skills/writing-bun-scripts/tests/script-check.test.ts:238:28: error typescript(no-misused-promises): Promise returned in function argument where a void return was expected.
agents/skills/writing-bun-scripts/tests/script-check.test.ts:238:31: error typescript(strict-void-return): Value returned in a context where a void return is expected.
Fix these and anything else `mise run lint:ts` reports in your files, without disabling rules. If the land log
shows a rebase conflict, re-apply your change on current alpha by meaning instead. Re-run verify (which includes
lint:ts). Test data under TMPDIR only. Do not commit or push.
