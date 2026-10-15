+++
schema = 2
name = "router-prompt"
outcome = "the request agx sends to Jev is redesigned from the objective down: (1) the objective is a logic tree, stated as one shared constant used by both the picker instructions (tools/agx/src/next/route.ts) and the rendered CLAUDE.md line (scripts/render-home.ts:397): root = get an accepted, useful result for this ticket fast and cheaply within subscription limits; branch A capability sufficiency (hard: required capability tags, task size, long terminal/agentic work), branch B expected time to an accepted return, branch C cost and subscription health (7-day windows weigh most, 5-hour window secondary information, a bias toward the codex route is acceptable), branch D history as a weak prior for reference only (never the main criterion; little history = uncertainty, not a reason); agx states the objective, Jev decides, agx removes no inputs and overrides nothing (scope.md); (2) the inputs are exactly what the branches need and no more: replace the 50 raw history runs with a short per-row aggregate (accepted/partial/rejected counts here, recent, for comparable tickets when available), pass that aggregate into criterionFor (today route.ts calls criterionFor(roster,row) without it, so every row says 'no graded runs here yet'), reduce each usage window to used/elapsed/pace/status, and keep the brief excerpt only as long as the capability branch needs; (3) measure the request size in tokens before and after on 3 recorded tickets and report both; (4) fix the codex usage read flipping between fresh and `unknown` on consecutive picks minutes apart"
writes = ["tools/agx/src/next/route.ts", "tools/agx/src/next/usage.ts", "tools/agx/src/next/policy*.ts", "tools/agx/src/next/history*.ts", "tools/agx/tests/**", "agents/models/roster.ts", "agents/models/tests/**", "scripts/render-home.ts", "scripts/tests/render-home*.test.ts", "tools/*/.changes/*.md"]
verify = ["bun test tools/agx/tests", "bun test agents/models", "bun test scripts/tests/render-home.test.ts", "mise run lint:ts", "mise run lint:bun", "mise run typecheck"]
timeout_s = 3000
premises = ["file:tools/agx/src/next/route.ts", "file:agents/models/roster.ts", "file:tools/agx/docs/scope.md"]

[proposition]
id = "ROUTER-PROMPT-TREE"
claim = "the objective constant is a 4-branch logic tree with history as a weak prior; the same constant renders into CLAUDE.md and the picker instructions; criterionFor receives a per-row graded aggregate; the request carries no raw 50-run history; request tokens for 3 recorded tickets are reported before and after and are lower after; two consecutive reads of a fresh codex usage source report fresh"
refuted_by = "history stated as the main criterion, two diverging policy texts, criterionFor still called without graded data, a larger request, or codex usage flipping to unknown"
+++

Owner (2026-10-16): "過去の比較できるチケットの成績を重視せよ — それは参考程度であるべき。より strategic なプロンプトにして。目的合理性から
logic tree が組み立てられているべき。判断材料は過不足なく提供されているべき。多すぎても ingress で過金額が増える"; earlier: "7d を重視。
codex 偏重のバイアスは方針として維持してよい。5h も材料として提供し、目的関数だけを提示する". Today's objective text is
agents/models/roster.ts:130 (ROUTING_OBJECTIVE); the pace sentence is a literal at route.ts:96 and a copy at
render-home.ts:397. This supersedes ticket router-policy (stopped); continue from its workspace changes where useful. Read
tools/agx/docs/scope.md first. Add no sync calls. You cannot rebase in the sandbox; land rebases. Definition of done:
`mise run hook:pre-commit` exits 0; record its exit code and last line in the checks field of your JSON return. Test data
outside the workspace. Do not commit or push.
