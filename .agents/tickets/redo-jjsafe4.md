+++
schema = 2
name = "redo-jjsafe4"
outcome = "the still-needed intent of the abandoned workspace dotfiles-ws-jjsafe4 is re-applied on current alpha: its change is exported at /home/fuyu/.cache/coord/triage2/dotfiles-ws-jjsafe4.patch (a triage judged it REDO: still needed, but stale against alpha); read the patch and the triage note, decide per hunk what alpha already has, and re-implement only the missing behaviour against today's code (do not apply the patch blindly); if alpha already covers it all, change nothing and say so with the alpha commits"
writes = ["agents/claude/hooks/enforce-official-execution.ts","agents/hooks/enforce-storage-headroom.ts","agents/hooks/storage-headroom.contract.md","agents/hooks/tests/enforce-storage-headroom.test.ts","tools/agx/contract.md","tools/agx/docs/ref-writer-inventory.md","tools/agx/docs/scope.md","tools/agx/src/premises.ts","tools/agx/src/workers/codex.ts","tools/agx/tests/codex.test.ts","tools/agx/tests/jj-read.test.ts","tools/agx/tests/premises.test.ts","tools/agx/tests/readonly-command.test.ts","tools/repo-retrieve/.changes/isolate-git-inspection-from-shared-ref-writes-under-router-deadl.md","tools/repo-retrieve/src/ccc-index.ts","tools/repo-retrieve/src/ccc-scope.ts","tools/repo-retrieve/src/child.ts","tools/repo-retrieve/src/definitions.ts","tools/repo-retrieve/tests/repo-retrieve.test.ts","tools/shared/src/jj-read.ts","tools/shared/src/readonly-command.ts","tools/shared/src/readonly-exec.ts","tools/*/.changes/*.md"]
verify = ["mise run lint:ts", "mise run typecheck", "mise run lint:no-sync"]
timeout_s = 2400
premises = []

[proposition]
id = "REDO-JJSAFE4"
claim = "each hunk of the old patch is classified (already in alpha with commit / re-implemented here / dropped as obsolete with reason); the affected tests pass"
refuted_by = "a hunk left unclassified, or a re-implementation without a passing test"
+++

Add no sync calls. Do not rebase; land rebases. Record `mise run hook:pre-commit` exit code and last line in the checks
field of your JSON return. Test data outside the workspace. Do not commit or push.
