+++
schema = 2
name = "nosync-u38"
outcome = "every node/no-sync violation in unit U38's files (3 at plan time) is gone: synchronous fs/child_process calls become their async forms, callers await them, and return values, callbacks and cleanup stay correct after the later units make their own APIs async"
writes = ["tools/serena-foreground/**/*.ts", "tools/*/.changes/*.md"]
verify = ["bunx --bun oxlint -A all -D node/no-sync tools/serena-foreground", "mise run typecheck", "bun test tools/serena-foreground", "mise run lint:ts"]
timeout_s = 2400
premises = ["file:tools/serena-foreground"]

[proposition]
id = "NOSYNC-U38"
claim = "oxlint node/no-sync reports zero diagnostics on U38's files, typecheck passes, and the unit's tests pass with unchanged behavior"
refuted_by = "a remaining node/no-sync diagnostic in the unit, a type error, a failing test, an un-awaited promise, or a sync disposer that no longer waits for its cleanup"
+++

Unit U38 of the accepted node/no-sync partition (plan run 5841ff4e). Plan rows that name U38, verbatim:
| U49 | `tools/agent-resource-run/**/*.ts` | 92 | CLI、公開 API、テスト | U38 |
Files (plan cell, verbatim): `tools/serena-foreground/**/*.ts`
Entry points: CLI、公開 API、テスト. Depends on (must already be on alpha): —.
Abbreviations: SK=agents/skills, DR=tools/disk-reclaim, SH=tools/shared, P(a,b)=existing scripts/{a,b}.ts and
scripts/tests/{a,b}.test.ts. Where the cell says ただし…を除く (except …), do not edit the excluded files.
Rules from the plan: when you call a function owned by a LATER unit that is still sync, write the call so it stays
correct once it returns a Promise (await it; type with Awaited<ReturnType<…>>; accept async cleanup). Constructors,
sync iterators and Symbol.dispose cannot become async: change the calling pattern (factory, async iterator,
await using / Symbol.asyncDispose). Array.filter/some with async predicates do not wait: collect I/O first or loop.
Public APIs of tools with external consumers keep their Promise contract. A tool you change needs a patch changeset
(`MISE_TRUSTED_CONFIG_PATHS=$PWD MISE_STATE_DIR=$(mktemp -d) mise run changeset -- <tool> patch "<one line>"`).
Do not edit files outside writes; if a fix needs one, finish what you can and list it. Do not commit or push.
