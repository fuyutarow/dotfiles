+++
schema = 2
name = "gate-consumers-pure"
outcome = "the `usehooks:consumers` gate (tools/agx-usehooks/src/check-consumers.ts, called by mise.toml:472 and scripts/land.ts:401) fails a dotfiles land only for errors the landed change causes: for each declared consumer it typechecks the consumer against alpha's agx-usehooks and against the workspace's, and fails only on diagnostics present with the workspace and absent with alpha (a consumer that is already broken on alpha is reported as PRE-EXISTING with its error count, not as a failure); when the landed diff does not touch tools/agx-usehooks the check is SKIP with that reason"
writes = ["tools/agx-usehooks/src/check-consumers.ts", "tools/agx-usehooks/src/check-consumers-*.ts", "tools/agx-usehooks/tests/**", "tools/*/.changes/*.md"]
verify = ["bun test tools/agx-usehooks", "mise run usehooks:consumers", "mise run lint:ts"]
timeout_s = 2400
premises = ["file:tools/agx-usehooks/src/check-consumers.ts", "file:scripts/land.ts"]

[proposition]
id = "GATE-CONSUMERS-PURE"
claim = "fixtures: a consumer with 14 type errors on alpha and the same 14 with the workspace → PRE-EXISTING, exit 0; a workspace change to agx-usehooks that adds one consumer error → FAIL naming that diagnostic; a land diff that does not touch tools/agx-usehooks → SKIP; a missing consumer → SKIP as today"
refuted_by = "a land that fails because a consumer was already broken on alpha, or an agx-usehooks change that adds a consumer error and passes"
+++

Incident 2026-10-15 23:5x: landing arch-spec (a markdown-only change) failed at the commit gate because
`usehooks:consumers` typechecked firedancer's live checkout, which has 14 TS errors in launcher/ (snapshot_gc.ts,
v1_record.ts, ...) unrelated to dotfiles. Every dotfiles land is blocked by another repo's working state. This is a
violation of architecture invariant I9 (the gate depends only on the tree being integrated; tools/spec/architecture.md
once landed, today /home/fuyu/Workspace/retrospectives/2026-10-15-dispatch-architecture.md). Read consumers read-only;
never edit or build in a consumer repo. Do not edit scripts/land.ts unless the check cannot learn the landed diff
otherwise (then say why in your return). Test data outside the workspace. Do not commit or push.
