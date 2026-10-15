+++
schema = 2
name = "nosync-u34"
outcome = "every node/no-sync violation in unit U34's files (12 at plan time) is gone: synchronous fs/child_process calls become their async forms, callers await them, and return values, callbacks and cleanup stay correct after the later units make their own APIs async"
writes = ["agents/skills/writing-typescript/tests/consumer-repo.test.ts", "tools/*/.changes/*.md"]
verify = ["bunx --bun oxlint -A all -D node/no-sync agents/skills/writing-typescript/tests/consumer-repo.test.ts", "mise run typecheck", "bun test agents/skills/writing-typescript/tests/consumer-repo.test.ts", "mise run lint:ts"]
timeout_s = 2400
premises = ["file:agents/skills/writing-typescript/tests/consumer-repo.test.ts"]

[proposition]
id = "NOSYNC-U34"
claim = "oxlint node/no-sync reports zero diagnostics on U34's files, typecheck passes, and the unit's tests pass with unchanged behavior"
refuted_by = "a remaining node/no-sync diagnostic in the unit, a type error, a failing test, an un-awaited promise, or a sync disposer that no longer waits for its cleanup"
+++

Unit U34 of the accepted node/no-sync partition (plan run 5841ff4e). Plan rows that name U34, verbatim:
(none beyond the files row)
Files (plan cell, verbatim): `SK/writing-typescript/tests/consumer-repo.test.ts`
Entry points: consumer テスト. Depends on (must already be on alpha): —.
Abbreviations: SK=agents/skills, DR=tools/disk-reclaim, SH=tools/shared, P(a,b)=existing scripts/{a,b}.ts and
scripts/tests/{a,b}.test.ts. Where the cell says ただし…を除く (except …), do not edit the excluded files.
Rules from the plan: when you call a function owned by a LATER unit that is still sync, write the call so it stays
correct once it returns a Promise (await it; type with Awaited<ReturnType<…>>; accept async cleanup). Constructors,
sync iterators and Symbol.dispose cannot become async: change the calling pattern (factory, async iterator,
await using / Symbol.asyncDispose). Array.filter/some with async predicates do not wait: collect I/O first or loop.
Public APIs of tools with external consumers keep their Promise contract. A tool you change needs a patch changeset
(`MISE_TRUSTED_CONFIG_PATHS=$PWD MISE_STATE_DIR=$(mktemp -d) mise run changeset -- <tool> patch "<one line>"`).
Do not edit files outside writes; if a fix needs one, finish what you can and list it. Do not commit or push.

## Current state (coordinator, 09:15)
The previous run (94078f4b) left this workspace with failing verify. Its first failing lines:
(fail) consumer-repo fixture > rendered through render-oxlintrc --repo, the rules are dotfiles' rules [2.48ms]
Continue from the workspace as it stands: fix these without disabling rules, re-run verify. A failure in
"stale consumer link" is a known pre-existing test failure owned by another ticket; ignore only that one.
config-map findings on zero-byte sandbox placeholder files (.claude/launch.json and peers) are removed by the
coordinator before land; ignore only those. Test data outside the workspace. Do not commit or push.
