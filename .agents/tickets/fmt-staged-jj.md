+++
schema = 2
name = "fmt-staged-jj"
outcome = "the shared fmt-staged helper (agents/skills/wiring-mise-tasks/scripts/fmt-staged.ts) has one VCS path, jj: coralbase's TOOLS-AUDIT (2026-10-16) flagged its git fallback (fmt-staged.ts:72 and :267) as an undeclared-version git dependency; remove the git fallback so the helper reads the changed files from jj only, and fails loudly with a clear message when the repo is not a jj repo; consumers (dotfiles hook:pre-commit and the root-package bin used by other repos) keep working"
writes = ["agents/skills/wiring-mise-tasks/scripts/fmt-staged.ts", "agents/skills/wiring-mise-tasks/tests/**", "agents/skills/wiring-mise-tasks/SKILL.md"]
verify = ["bun test agents/skills/wiring-mise-tasks", "mise run lint:ts", "mise run typecheck", "mise run lint:no-sync"]
timeout_s = 1800
premises = ["file:agents/skills/wiring-mise-tasks/scripts/fmt-staged.ts"]

[proposition]
id = "FMT-STAGED-JJ"
claim = "no git invocation remains in fmt-staged.ts; tests: a jj fixture repo formats exactly its changed files; a non-jj directory exits non-zero naming the requirement; dotfiles `mise run hook:pre-commit` passes"
refuted_by = "a remaining git call, or a consumer that breaks"
+++

Another ticket (mise-contract-split) edits mise-contract.ts in the same skill; touch only fmt-staged.ts and its own
tests. Add no sync calls. Do not rebase; land rebases. Record `mise run hook:pre-commit` exit code and last line in the
checks field of your JSON return. Test data outside the workspace. Do not commit or push.
