+++
schema = 2
name = "router-policy"
outcome = "the routing policy matches the owner's ruling of 2026-10-16: Jev receives ALL usage data (claude 5h and 7d, codex 7d, each with used, elapsed and pace) as material, and the policy states only the OBJECTIVE, not rules: weigh the 7-day windows most (avoid exhausting a 7d quota early and avoid leaving 7d quota unused at reset), treat the 5h window as secondary information, and a bias toward the codex route is acceptable; agx neither removes inputs nor excludes rows nor overrides Jev (scope.md stands); the rendered CLAUDE.md policy line (scripts/render-home.ts:397) and the picker instructions (tools/agx/src/next/route.ts:96) are produced from one shared constant; and the codex usage read no longer flips between fresh and `unknown` on consecutive picks a few minutes apart when its source is fresh"
writes = ["scripts/render-home.ts", "scripts/tests/render-home*.test.ts", "tools/agx/src/next/route.ts", "tools/agx/src/next/usage.ts", "tools/agx/src/next/policy*.ts", "tools/agx/tests/**", "tools/shared/src/**", "tools/*/.changes/*.md"]
verify = ["bun test tools/agx/tests", "bun test scripts/tests/render-home.test.ts", "mise run lint:ts", "mise run lint:bun", "mise run typecheck"]
timeout_s = 2400
premises = ["file:scripts/render-home.ts", "file:tools/agx/src/next/route.ts", "file:tools/agx/src/next/usage.ts"]

[proposition]
id = "ROUTER-POLICY-7D"
claim = "the rendered CLAUDE.md policy line and the picker instruction come from one constant, state the 7d-first objective with 5h as secondary information and the acceptable codex bias, and contain no exclusion rule; the usage snapshot given to Jev still carries the 5h window; agx withholds no rows; two consecutive usage reads of a fresh codex source both report status fresh"
refuted_by = "an input removed from Jev, a rule that withholds or overrides rows, two diverging policy texts, or codex usage flipping to unknown with a fresh source"
+++

Owner ruling (2026-10-16): "重視されるべきは 7d の方です。とくに codex が偏重されるバイアスは方針として維持しても良い"; the
all-sol-medium picks of this morning are acceptable under that policy. Evidence of the flapping: pick_audit of preset-cargo
(codex usage fresh, 34% at 11% elapsed) vs preset-latex/preset-ts-ref a few minutes later (codex usage `unknown`).
scope.md stands: Jev picks; agx does not override. Add no sync calls. You cannot rebase in the sandbox; land rebases.
Definition of done: `mise run hook:pre-commit` exits 0; record its exit code and last line in the checks field of your
JSON return. Test data outside the workspace. Do not commit or push.

## Current state (coordinator correction — single current version)
Owner clarification: "材料は提供するけど、目的関数だけを提示している" — give Jev every usage window as material and state only the
objective (7d first, 5h secondary, codex bias acceptable); do not drop the 5h window and do not add exclusion rules.
Continue from your workspace; if you already removed the 5h input, restore it.

