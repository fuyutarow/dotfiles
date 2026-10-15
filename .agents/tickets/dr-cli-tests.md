+++
schema = 2
name = "dr-cli-tests"
outcome = "bun test tools/disk-reclaim/tests/cli.test.ts passes on alpha: today 11 of 20 tests fail on alpha itself (observed 2026-10-16 by the coordinator, e.g. 'default plan and explicit plan emit one valid JSON document from any cwd', '--no-progress suppresses plan progress on stderr', 'apply accepts --no-progress and proceeds to its stdin contract': expected exit 0); find the cause (the nn-3 worker reported a mismatch between the test fixture and the config schema) and fix it in the code or the fixture, whichever is wrong"
writes = ["tools/disk-reclaim/src/**", "tools/disk-reclaim/tests/**", "tools/disk-reclaim/.changes/*.md"]
verify = ["bun test tools/disk-reclaim", "mise run lint:ts", "mise run typecheck", "mise run lint:no-sync"]
timeout_s = 2400
premises = ["file:tools/disk-reclaim/tests/cli.test.ts"]

[proposition]
id = "DR-CLI-TESTS-GREEN"
claim = "all of tools/disk-reclaim's tests pass, and the cause of the 11 failures is named with file:line"
refuted_by = "a failing disk-reclaim test, a test weakened to pass, or an unnamed cause"
+++

Do not weaken assertions to make them pass; if the test expects behaviour the code no longer has on purpose (see the
reclaim-fix commit 7583ef6a), update the test and say which commit changed the behaviour. Add no sync calls. You cannot
rebase in the sandbox; land rebases. Definition of done: `mise run hook:pre-commit` exits 0; record its exit code and last
line in the checks field of your JSON return. Test data outside the workspace. Do not commit or push.
