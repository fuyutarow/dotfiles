+++
schema = 2
name = "nosync-agx"
outcome = "zero node/no-sync violations in tools/agx tools/agx-usehooks: synchronous fs/child_process calls are replaced by their async forms (Bun.file/Bun.write, node:fs/promises, Bun.$ / Bun.spawn) with behavior unchanged and tests passing"
writes = ["tools/agx/**", "tools/agx-usehooks/**", "tools/*/.changes/*.md"]
verify = ["bunx --bun oxlint -A all -D node/no-sync tools/agx tools/agx-usehooks", "mise run gate:land"]
timeout_s = 3000
premises = ["task:gate:land"]

[proposition]
id = "NO-SYNC-NOSYNC-AGX"
claim = "`bunx --bun oxlint -A all -D node/no-sync tools/agx tools/agx-usehooks` reports 0 problems and gate:land passes"
refuted_by = "any node/no-sync report in these paths, a disable comment added to silence it, or a behavior/test regression"
+++

Owner (2026-10-15): node/no-sync must hold across all of dotfiles, not only coralbase. Measured 2026-10-15 with
`oxlint -A all -D node/no-sync`: 4,479 violations repo-wide; this ticket owns one disjoint slice (tools/agx tools/agx-usehooks). Other slices
run in parallel tickets nosync-*; touch nothing outside your writes. A final ticket enables the rule in the policy.
Do:
- Convert every synchronous call (readFileSync, writeFileSync, existsSync, statSync, mkdirSync, readdirSync, spawnSync,
  execSync, …) to the async form and make the callers async; propagate await up to the entry point. Prefer Bun-native
  APIs where the file already uses Bun; follow the repo's errors-as-values rules (no try; neverthrow/attempt).
- Tests: test fixtures may use the async forms too (bun:test supports async tests and hooks).
- No `oxlint-disable` comments (lint:ts-no-disable forbids them). If a call genuinely cannot be async (e.g. a sync API
  contract required by a vendor callback), stop and report it with file:line and the reason instead of silencing it.
- Keep behavior identical; run the package's own tests plus the verify commands.
Changesets for touched tools in the blank-line frontmatter shape (patch). Do not commit or push.
