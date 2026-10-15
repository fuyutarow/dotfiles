+++
schema = 2
name = "nosync-u01"
outcome = "every node/no-sync violation in unit U01's files (65 at plan time) is gone: synchronous fs/child_process calls become their async forms, callers await them, and return values, callbacks and cleanup stay correct after the later units make their own APIs async"
writes = ["agents/goal-kernel/**/*.ts", "agents/claude/hooks/goal-kernel.ts", "agents/codex/hooks/goal-kernel.ts", "tools/*/.changes/*.md"]
verify = ["bunx --bun oxlint -A all -D node/no-sync agents/goal-kernel agents/claude/hooks/goal-kernel.ts agents/codex/hooks/goal-kernel.ts", "mise run typecheck", "bun test agents/goal-kernel", "mise run lint:ts"]
timeout_s = 2400
premises = ["file:agents/goal-kernel", "file:agents/claude/hooks/goal-kernel.ts", "file:agents/codex/hooks/goal-kernel.ts"]

[proposition]
id = "NOSYNC-U01"
claim = "oxlint node/no-sync reports zero diagnostics on U01's files, typecheck passes, and the unit's tests pass with unchanged behavior"
refuted_by = "a remaining node/no-sync diagnostic in the unit, a type error, a failing test, an un-awaited promise, or a sync disposer that no longer waits for its cleanup"
+++

Unit U01 of the accepted node/no-sync partition (plan run 5841ff4e; full plan: /home/fuyu/.cache/coord/nosync-units.md, read its
rules section and the "confirmed boundaries" table for rows naming U01).
Files (plan cell, verbatim): `agents/goal-kernel/**/*.ts` ＋ `agents/{claude,codex}/hooks/goal-kernel.ts`
Entry points: CLI、両 hook、テスト. Depends on (must already be on alpha): —.
Abbreviations: SK=agents/skills, DR=tools/disk-reclaim, SH=tools/shared, P(a,b)=existing scripts/{a,b}.ts and
scripts/tests/{a,b}.test.ts. Where the cell says ただし…を除く (except …), do not edit the excluded files.
Rules from the plan: when you call a function owned by a LATER unit that is still sync, write the call so it stays
correct once it returns a Promise (await it; type with Awaited<ReturnType<…>>; accept async cleanup). Constructors,
sync iterators and Symbol.dispose cannot become async: change the calling pattern (factory, async iterator,
await using / Symbol.asyncDispose). Array.filter/some with async predicates do not wait: collect I/O first or loop.
Public APIs of tools with external consumers keep their Promise contract. A tool you change needs a patch changeset
(`MISE_TRUSTED_CONFIG_PATHS=$PWD MISE_STATE_DIR=$(mktemp -d) mise run changeset -- <tool> patch "<one line>"`).
Do not edit files outside writes; if a fix needs one, finish what you can and list it. Do not commit or push.

## Current state (coordinator agt_g67e, 17:48)
Run 1ef9677c-cefa-483b-8f22-06c775d022b7 ended; agx's verify after it failed:
- exit 1: mise run lint:ts
Re-run each failing command, fix what the change causes, re-run all verify, and return a report. A failure that also
happens on a clean alpha checkout (/home/fuyu/dotfiles at alpha): show it and list it in open.
