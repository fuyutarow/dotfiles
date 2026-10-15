+++
schema = 2
name = "agx-overrun"
outcome = "agx shows when a run is overrunning, as a fold of existing data (scope.md §4): a ticket may declare `expect_s` (expected duration, distinct from the hard timeout_s); `agx ls` (and --json) adds a derived `overrun` field for a running run whose elapsed time exceeds expect_s (elapsed, expect_s), no new stored state; `agx ls --workspace <path-prefix>` selects runs whose recorded workspace/cwd lies under a prefix, so a project can watch only its own runs (firedancer asked to stop filtering units by ExecStart path); `agx check` validates expect_s <= timeout_s; tools/agx/docs/scope.md records both as folds"
writes = ["tools/agx/src/**", "tools/agx/tests/**", "tools/agx/docs/**", "tools/agx/.changes/*.md"]
verify = ["bun test tools/agx/tests", "mise run lint:ts", "mise run typecheck", "mise run lint:no-sync"]
timeout_s = 2400
premises = ["file:tools/agx/docs/scope.md"]

[proposition]
id = "AGX-OVERRUN"
claim = "tests: a running fixture run past expect_s lists overrun with elapsed and expect_s, one under it does not, an ended run never does; --workspace selects by prefix; check rejects expect_s > timeout_s; no new event type is written"
refuted_by = "a stored overrun field or event, or a running run past expect_s listed without overrun"
+++

Read tools/agx/docs/scope.md first. An event stream (`--watch`) is NOT in scope: notifications are hooks consuming
`agx ls --json`. Add no sync calls. Do not rebase; land rebases. Record `mise run hook:pre-commit` exit code and last line in
the checks field of your JSON return. Test data outside the workspace. Do not commit or push.
