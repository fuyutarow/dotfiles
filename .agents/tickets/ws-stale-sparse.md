+++
schema = 2
name = "ws-stale-sparse"
outcome = "`ws add` makes a workspace that is current and complete, as polysearch reported (2026-10-16): (1) after a rebase moves the commits under a workspace, that workspace is stale and agx premises fail; `ws` runs `jj workspace update-stale` in a workspace before its readiness commands when jj reports it stale, and offers `ws refresh <slug>` that does only that; (2) sparse patterns differed per workspace and artefacts silently fell out of version control; `ws add` sets the new workspace's sparse patterns to `.` (everything) and `ws gc --dry-run` reports any workspace whose sparse set is not `.`"
writes = ["tools/jj-ws/**", "tools/spec/jj-ws.md", "tools/*/.changes/*.md"]
verify = ["bun test tools/jj-ws", "mise run lint:ts", "mise run typecheck", "mise run lint:no-sync"]
timeout_s = 2400
premises = ["file:tools/jj-ws/package.json", "file:tools/spec/jj-ws.md"]

[proposition]
id = "WS-STALE-SPARSE"
claim = "fixtures: rebasing the parent of a workspace then `ws refresh` (and `ws add` of another slug) leaves it non-stale; a new workspace has sparse `.`; a fixture workspace with a narrowed sparse set is reported by `ws gc --dry-run`"
refuted_by = "a stale workspace after refresh, or a new workspace with a narrowed sparse set"
+++

Use a temp jj repo for fixtures. Add no sync calls. Do not rebase; land rebases. Record `mise run hook:pre-commit` exit
code and last line in the checks field of your JSON return. Test data outside the workspace. Do not commit or push.
