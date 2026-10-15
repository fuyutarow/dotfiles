+++
schema = 2
name = "searchbusy"
outcome = "an rr search issued while the ccc daemon is indexing the same project says so (status line 'daemon busy indexing <project>: N files listed, M added'), waits up to its bound, and then reports a classified BUSY result with a non-zero exit distinct from FATAL, instead of 'FATAL: search child timed out after 10000ms'"
writes = ["tools/repo-retrieve/**", "tools/*/.changes/*.md"]
verify = ["bun test tools/repo-retrieve", "mise run gate:land"]
timeout_s = 1500
premises = ["file:tools/repo-retrieve/src/repo-retrieve.ts"]

[proposition]
id = "SEARCH-BUSY-CLASSIFIED"
claim = "with a fake daemon that reports indexing-in-progress and never answers search, rr search exits with the BUSY code and names the indexing project; with a dead daemon it still exits FATAL"
refuted_by = "the busy fixture yields 'FATAL: search child timed out', or the dead-daemon fixture yields BUSY"
+++

Observed 2026-10-15 (firedancer re-index 13:05-13:32): the indexing client printed 18 times
"FATAL: search child timed out after 10000ms: /home/fuyu/.local/bin/ccc" while the daemon was busy indexing that
project; searches queued behind the index. FATAL here misleads agents into "the tool is broken".
Do: before/at timeout, query daemon status (the existing `ccc daemon status` / status path repo-retrieve already uses)
and classify: indexing the project → BUSY (own exit code, message with progress and the hint "retry after the index or
use lexical routes rr text|regex|files, which do not need ccc"); daemon unreachable → FATAL as now. Tests with fakes.
Do not run a real index. Changeset in the blank-line shape. Do not commit or push.

## Current state (coordinator, 2026-10-15 15:40)
Run d1b97f4f is accepted. Its changeset tools/repo-retrieve/.changes/search-busy.md lacks the `---` delimiters; rewrite
it to exactly:
    ---
    bump: patch
    ---

    Classify timed-out searches against daemon status so indexing reports BUSY progress and unavailable daemons remain FATAL.
Change nothing else; re-run verify.
