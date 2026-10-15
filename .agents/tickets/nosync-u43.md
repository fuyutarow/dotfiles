+++
schema = 2
name = "nosync-u43"
outcome = "every node/no-sync violation in unit U43's files (25 at plan time) is gone: synchronous fs/child_process calls become their async forms, callers await them, and return values, callbacks and cleanup stay correct after the later units make their own APIs async"
writes = ["presets/src/cli.ts", "presets/tests/presets.test.ts", "tools/*/.changes/*.md"]
verify = ["bunx --bun oxlint -A all -D node/no-sync presets/src/cli.ts presets/tests/presets.test.ts", "mise run typecheck", "bun test presets/tests/presets.test.ts", "mise run lint:ts"]
timeout_s = 2400
premises = ["file:presets/src/cli.ts", "file:presets/tests/presets.test.ts"]

[proposition]
id = "NOSYNC-U43"
claim = "oxlint node/no-sync reports zero diagnostics on U43's files, typecheck passes, and the unit's tests pass with unchanged behavior"
refuted_by = "a remaining node/no-sync diagnostic in the unit, a type error, a failing test, an un-awaited promise, or a sync disposer that no longer waits for its cleanup"
+++

Unit U43 of the accepted node/no-sync partition (plan run 5841ff4e). Plan rows that name U43, verbatim:
| U48 | `P(lint-bun,lint-hook-slug,lint-skill-script-paths,lint-skills-floor,lint-skills-index,lint-ts-no-disable,lint-zsh,render-oxlintrc,hook-slug,oxlint-policy,render-oxlintrc-repo)` | 88 | lint/render CLI、テスト | U43 |
Files (plan cell, verbatim): `presets/src/cli.ts`、`presets/tests/presets.test.ts`
Entry points: preset CLI、テスト. Depends on (must already be on alpha): —.
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
presets/tests/presets.test.ts:55:10: error typescript(return-await): Returning an awaited promise is not allowed in this context.
[lint:ts] ERROR task failed
[commit] ERROR task failed
Fix these and anything else `mise run lint:ts` reports in your files, without disabling rules. If the land log
shows a rebase conflict, re-apply your change on current alpha by meaning instead. Re-run verify (which includes
lint:ts). Test data under TMPDIR only. Do not commit or push.
