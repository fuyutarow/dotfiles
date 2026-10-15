+++
schema = 2
name = "nosync-u34"
outcome = "the nosync-u34 workspace has no conflict: agents/skills/writing-typescript/tests/consumer-repo.test.ts keeps both alpha's change (preset-ts-ref 71c7862e: the test points at the real preset files) and this unit's sync-to-async conversion; nothing else changes"
writes = ["agents/skills/writing-typescript/tests/consumer-repo.test.ts"]
verify = ["bun test agents/skills/writing-typescript", "mise run lint:ts", "mise run typecheck"]
timeout_s = 1200
premises = ["file:agents/skills/writing-typescript/tests/consumer-repo.test.ts"]

[proposition]
id = "NOSYNC-U34-RESOLVE"
claim = "the file has no conflict markers, its tests pass, and it contains no new synchronous fs call"
refuted_by = "a conflict marker left, a lost side of the conflict, or a failing test"
+++

The coordinator rebased this workspace onto alpha; jj reports a 2-sided conflict in that one file. Resolve it by meaning
(edit the file; do not run jj). You cannot rebase in the sandbox. Record `mise run hook:pre-commit` exit code and last line
in the checks field of your JSON return. Test data outside the workspace. Do not commit or push.
