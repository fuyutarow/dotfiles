+++
schema = 2
name = "tests-hermetic"
outcome = "the statusline and Claude-hook test suites give the same verdict alone and in a full run, under any load: on 2026-10-16 `bun test tools/statusline` on alpha failed 2 tests in a full run while each passes alone (e.g. 'renders a 7d only window and integer credits'), and `bun test agents/claude/hooks/tests` failed 'small-file viewer history exemption > coordinator variables, home paths and compound reads ignore slow history' in full runs while passing alone; find each failing test's hidden input (shared persisted state such as a last-good or snapshot file under the real HOME/XDG dirs, Bash-history or timing files, test order, wall-clock or load-sensitive timeouts) and make it hermetic: every test gets its own HOME/XDG/TMPDIR (tools/shared test-tmp), no test reads the real user's state, and timing assertions use injected clocks instead of wall time"
writes = ["tools/statusline/tests/**", "tools/statusline/src/**", "agents/claude/hooks/tests/**", "agents/claude/hooks/*.ts", "tools/shared/src/test-tmp.ts", "tools/shared/tests/**", "tools/*/.changes/*.md"]
verify = ["bun test tools/statusline", "bun test agents/claude/hooks/tests", "mise run lint:ts", "mise run typecheck", "mise run lint:no-sync"]
timeout_s = 2700
premises = ["file:tools/shared/src/test-tmp.ts"]

[proposition]
id = "TESTS-HERMETIC"
claim = "each named test's hidden input is named with file:line; both suites pass 3 full runs in a row, including one run while `stress-ng --cpu 12 --timeout 120` or an equivalent bun busy loop loads the machine; no test reads files under the real $HOME (shown by running the suites with HOME pointed at an empty temp dir)"
refuted_by = "a failure in any of the full runs, or a test that still reads the real user's state"
+++

Another ticket (statusline-agx-sticky) is landing changes to tools/statusline/src; keep src changes to what hermeticity
needs (injectable paths and clocks). Add no sync calls. Do not rebase; land rebases. Record `mise run hook:pre-commit`
exit code and last line in the checks field of your JSON return. Test data outside the workspace. Do not commit or push.
