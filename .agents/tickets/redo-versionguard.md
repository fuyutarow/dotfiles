+++
schema = 2
name = "redo-versionguard"
outcome = "the still-needed intent of the abandoned workspace dotfiles-ws-versionguard is re-applied on current alpha: its change is exported at /home/fuyu/.cache/coord/triage2/dotfiles-ws-versionguard.patch (a triage judged it REDO: still needed, but stale against alpha); read the patch and the triage note, decide per hunk what alpha already has, and re-implement only the missing behaviour against today's code (do not apply the patch blindly); if alpha already covers it all, change nothing and say so with the alpha commits"
writes = ["README.md","agents/skills/writing-bun-scripts/SKILL.md","mise.toml","scripts/land-changesets.ts","scripts/land.ts","scripts/lint-tool-changesets.ts","scripts/tests/gate-land.test.ts","scripts/tests/lint-tool-changesets.test.ts","tools/agx/.changes/release-ownership-prompt.md","tools/agx/src/report.ts","tools/*/.changes/*.md"]
verify = ["mise run lint:ts", "mise run typecheck", "mise run lint:no-sync"]
timeout_s = 2400
premises = []

[proposition]
id = "REDO-VERSIONGUARD"
claim = "each hunk of the old patch is classified (already in alpha with commit / re-implemented here / dropped as obsolete with reason); the affected tests pass"
refuted_by = "a hunk left unclassified, or a re-implementation without a passing test"
+++

Add no sync calls. Do not rebase; land rebases. Record `mise run hook:pre-commit` exit code and last line in the checks
field of your JSON return. Test data outside the workspace. Do not commit or push.
