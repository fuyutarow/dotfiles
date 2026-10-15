+++
schema = 2
name = "redo-tools-spec"
outcome = "the still-needed intent of the abandoned workspace dotfiles-ws-tools-spec is re-applied on current alpha: its change is exported at /home/fuyu/.cache/coord/triage2/dotfiles-ws-tools-spec.patch (a triage judged it REDO: still needed, but stale against alpha); read the patch and the triage note, decide per hunk what alpha already has, and re-implement only the missing behaviour against today's code (do not apply the patch blindly); if alpha already covers it all, change nothing and say so with the alpha commits"
writes = ["AGENTS.md","CLAUDE.md","README.md","agents/skills/operating-the-harness/SKILL.md","agents/skills/validating-experimental-evidence/tests/postmortem-2026-09-30-boundaries.md","scripts/lint-changesets.ts","scripts/lint-tools-spec.ts","scripts/test-resource-control.ts","scripts/tests/lint-tools-spec.test.ts","tools/agent-resource-run/src/agent-resource-run.ts","tools/agent-resource-run/tests/agent-resource-run.test.ts","tools/agx/README.md","tools/agx/contract.md","tools/agx/docs/next-records.md","tools/agx/docs/scope.md","tools/disk-reclaim/CONTRACT.md","tools/repo-retrieve/src/definitions.ts","tools/repo-retrieve/src/rerank_server.py","tools/repo-retrieve/tests/definitions.test.ts","tools/spec/agent-resource-run.md","tools/spec/agx-usehooks.md","tools/spec/agx.md","tools/spec/architecture.md","tools/spec/detect-japanese.md","tools/spec/disk-reclaim.md","tools/spec/repo-retrieve.md","tools/spec/statusline.md","tools/spec/storage-headroom.md","tools/statusline/tests/fixtures/agx-ls-sample.json","tools/*/.changes/*.md"]
verify = ["mise run lint:ts", "mise run typecheck", "mise run lint:no-sync"]
timeout_s = 2400
premises = []

[proposition]
id = "REDO-TOOLS-SPEC"
claim = "each hunk of the old patch is classified (already in alpha with commit / re-implemented here / dropped as obsolete with reason); the affected tests pass"
refuted_by = "a hunk left unclassified, or a re-implementation without a passing test"
+++

Add no sync calls. Do not rebase; land rebases. Record `mise run hook:pre-commit` exit code and last line in the checks
field of your JSON return. Test data outside the workspace. Do not commit or push.
