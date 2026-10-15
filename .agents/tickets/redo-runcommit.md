+++
schema = 2
name = "redo-runcommit"
outcome = "the still-needed intent of the abandoned workspace dotfiles-ws-runcommit is re-applied on current alpha: its change is exported at /home/fuyu/.cache/coord/triage2/dotfiles-ws-runcommit.patch (a triage judged it REDO: still needed, but stale against alpha); read the patch and the triage note, decide per hunk what alpha already has, and re-implement only the missing behaviour against today's code (do not apply the patch blindly); if alpha already covers it all, change nothing and say so with the alpha commits"
writes = ["tools/agx/.changes/snapshot-worker-workspaces-when-runs-end-and-expose-commit-ids-a.md","tools/agx/src/next/run.ts","tools/agx/src/next/snapshot.ts","tools/agx/src/next/store.ts","tools/agx/tests/next/incremental-fold.test.ts","tools/agx/tests/next/run.test.ts","tools/agx/tests/next/snapshot.test.ts","tools/*/.changes/*.md"]
verify = ["mise run lint:ts", "mise run typecheck", "mise run lint:no-sync"]
timeout_s = 2400
premises = []

[proposition]
id = "REDO-RUNCOMMIT"
claim = "each hunk of the old patch is classified (already in alpha with commit / re-implemented here / dropped as obsolete with reason); the affected tests pass"
refuted_by = "a hunk left unclassified, or a re-implementation without a passing test"
+++

Add no sync calls. Do not rebase; land rebases. Record `mise run hook:pre-commit` exit code and last line in the checks
field of your JSON return. Test data outside the workspace. Do not commit or push.
