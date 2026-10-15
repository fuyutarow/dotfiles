+++
schema = 2
name = "gate-tmp-isolation"
outcome = "the /tmp leak probe in scripts/lint-tmp-leaks.ts (run by `mise run lint:bun`, mise.toml:291) judges only entries its own probe process tree created: it runs the probe with a private TMPDIR parent and attributes leaks inside it, or compares only entries whose creating pid belongs to the probe; entries created by other processes or sessions in the shared /tmp never fail it"
writes = ["scripts/lint-tmp-leaks.ts", "scripts/tests/lint-tmp-leaks*.test.ts", "tools/*/.changes/*.md"]
verify = ["bun test scripts/tests/lint-tmp-leaks.test.ts", "mise run lint:bun", "mise run lint:ts", "mise run typecheck"]
timeout_s = 1800
premises = ["file:scripts/lint-tmp-leaks.ts"]

[proposition]
id = "GATE-TMP-ISOLATION"
claim = "fixtures: four concurrent `mise run lint:bun` on a clean tree all PASS; a probe child that leaves a temp entry still FAILs naming it; an unrelated process creating /tmp entries during the run does not change the verdict"
refuted_by = "a verdict that changes when another process writes to /tmp"
+++

Incident 2026-10-16 08:2x: ten sequential-intended prechecks run in parallel all failed lint:bun with
"/tmp/.tmpXXXX: new top-level entry left by the probe" (scripts/lint-tmp-leaks.ts:136) because each saw the others'
entries; the same happens when other sessions run tests. Architecture I9 (a gate depends only on the tree it checks);
retro I-W3. Do not weaken detection of real leaks. Test data outside the workspace. Do not commit or push.

## Current state (coordinator, 10:0x — single current version)
Your change was accepted on substance. Land's commit gate (`lint:no-sync`) refused it: it adds 2 synchronous
fs/child_process calls (983 sites, baseline 981). Make those 2 calls async (await them); only if a call must stay
synchronous, mark it `// sync-ok: <reason>` on its line. Do not rebase (the shared jj store is read-only in the sandbox);
land rebases. Record `mise run hook:pre-commit` exit code and last line in the checks field of your JSON return.

