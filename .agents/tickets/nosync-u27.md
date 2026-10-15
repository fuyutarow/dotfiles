+++
schema = 2
name = "nosync-u27"
outcome = "every node/no-sync violation in unit U27's files (6 at plan time) is gone: synchronous fs/child_process calls become their async forms, callers await them, and return values, callbacks and cleanup stay correct after the later units make their own APIs async"
writes = ["agents/skills/systematizing-knowledge/scripts/check-ledger.ts", "agents/skills/systematizing-knowledge/tests/check-ledger.test.ts", "tools/*/.changes/*.md"]
verify = ["bunx --bun oxlint -A all -D node/no-sync agents/skills/systematizing-knowledge/scripts/check-ledger.ts agents/skills/systematizing-knowledge/tests/check-ledger.test.ts", "mise run typecheck", "bun test agents/skills/systematizing-knowledge/tests/check-ledger.test.ts", "mise run lint:ts"]
timeout_s = 2400
premises = ["file:agents/skills/systematizing-knowledge/scripts/check-ledger.ts", "file:agents/skills/systematizing-knowledge/tests/check-ledger.test.ts"]

[proposition]
id = "NOSYNC-U27"
claim = "oxlint node/no-sync reports zero diagnostics on U27's files, typecheck passes, and the unit's tests pass with unchanged behavior"
refuted_by = "a remaining node/no-sync diagnostic in the unit, a type error, a failing test, an un-awaited promise, or a sync disposer that no longer waits for its cleanup"
+++

Unit U27 of the accepted node/no-sync partition (plan run 5841ff4e). Plan rows that name U27, verbatim:
(none beyond the files row)
Files (plan cell, verbatim): `SK/systematizing-knowledge/{scripts/check-ledger.ts,tests/check-ledger.test.ts}`
Entry points: checker CLI、テスト. Depends on (must already be on alpha): —.
Abbreviations: SK=agents/skills, DR=tools/disk-reclaim, SH=tools/shared, P(a,b)=existing scripts/{a,b}.ts and
scripts/tests/{a,b}.test.ts. Where the cell says ただし…を除く (except …), do not edit the excluded files.
Rules from the plan: when you call a function owned by a LATER unit that is still sync, write the call so it stays
correct once it returns a Promise (await it; type with Awaited<ReturnType<…>>; accept async cleanup). Constructors,
sync iterators and Symbol.dispose cannot become async: change the calling pattern (factory, async iterator,
await using / Symbol.asyncDispose). Array.filter/some with async predicates do not wait: collect I/O first or loop.
Public APIs of tools with external consumers keep their Promise contract. A tool you change needs a patch changeset
(`MISE_TRUSTED_CONFIG_PATHS=$PWD MISE_STATE_DIR=$(mktemp -d) mise run changeset -- <tool> patch "<one line>"`).
Do not edit files outside writes; if a fix needs one, finish what you can and list it. Do not commit or push.

## Current state (coordinator agt_g67e, 17:49)
Run 505212b1-7dfe-4f37-b1ae-63d6630aa526 ended; agx's verify after it failed:
- exit 1: bun test agents/skills/systematizing-knowledge/tests/check-ledger.test.ts
Re-run each failing command, fix what the change causes, re-run all verify, and return a report. A failure that also
happens on a clean alpha checkout (/home/fuyu/dotfiles at alpha): show it and list it in open.
