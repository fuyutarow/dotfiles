# xmsg skill replacement — 2026-10-21

Owner request: retire the Codex-only messaging manual and provide one discoverable
`driving-xmsg` skill for existing Claude/Codex sessions. No tool implementation changes,
release changeset, vendor ledger, helpers or tests are needed for this authored manual.

Frozen source: `agents/skills/messaging-codex-sessions/SKILL.md`, supplied by the coordinator
from default revision `66c4ad065c9a046f2456a701b0116ff0187b1ea0`.
Baseline: `alpha` at `e0dcb72f1da87995487deb6fc331df99bb200bbf` (brief provenance).
Source SHA-256 before move and archive SHA-256 after move both equal
`888405e65fd75c2d842abfb0ef371a0de28d0fcade4bb501a8fa0e5f854e9cd6`.
Archive: `archives/skills/messaging-codex-sessions/SKILL.md`; preserved without byte edits.

CLI checked directly with `bun tools/xmsg/src/xmsg.ts --version`: `xmsg 0.2.1`.
Contract reviewed from local `tools/xmsg/README.md`, `src/xmsg.ts`, `src/inventory.ts`,
`src/recipient-prefix.ts`, `src/claude-receipt.ts`, and package declarations.
No external sources or real sends were used.

Known gap: interactive Claude registration visibility can exceed relay `ListAgents`
sendability; a listed recipient can produce exit 4 without a confirmed tool result.
This remains unresolved in the backend. Acceptance is enqueue evidence only; inventory
membership does not demonstrate delivery. Unknown acceptance must not trigger automatic retry.

Placement review: one common backend-neutral entrypoint owns existing-session messaging;
agx/orchestrating-agents retain creation and dispatch. Desk review covers explicit xmsg,
Claude/Codex relay and optional reply requests; generic Codex questions and new-worker
dispatch are outside the description. This is not measured live selector accuracy.

The new manual is 92 lines (`wc -l agents/skills/driving-xmsg/SKILL.md`).
Runtime/home sync and removal of stale deployed copies belong to the coordinator and are
not claimed here. The original default-workspace source is untouched by this worker.

## Foreground verification

| Command | Exit | Result |
|---|---|---|
| `bun tools/xmsg/src/xmsg.ts --version` | 0 | `xmsg 0.2.1` |
| `bun tools/xmsg/src/xmsg.ts --help` | 0 | List/send grammar, timeout and outcome contract match the manual. |
| `SKILLS_LINT_WORKTREE=1 bun scripts/lint-skills-floor.ts && SKILLS_LINT_WORKTREE=1 bun scripts/lint-skills-index.ts` | 0 | 57 skills, 49,348 name/description characters; index complete. 78 non-failing prose warnings across 41 skills. |
| `bun agents/skills/forging-skills/scripts/skill-check.ts agents/skills/driving-xmsg` | 0 | Structural floor passes; 11 long-sentence prose warnings. |
| `printf '%s\n' '888405e65fd75c2d842abfb0ef371a0de28d0fcade4bb501a8fa0e5f854e9cd6  archives/skills/messaging-codex-sessions/SKILL.md' \| sha256sum -c -` | 0 | Archive matches the source hash captured before moving. |
| `test -f archives/skills/messaging-codex-sessions/SKILL.md && test -f agents/skills/driving-xmsg/SKILL.md && test ! -e agents/skills/messaging-codex-sessions/SKILL.md` | 0 | Archive and successor exist; former active source does not. |
| `rumdl check agents/skills/driving-xmsg/SKILL.md archives/skills/README.md agents/skills/README.md tools/shared/evidence/xmsg-skill-replacement-20261021.md` | 0 | Config excludes skills and archives, so only evidence was checked. Superseded by explicit checks below. |
| `rumdl check --no-exclude agents/skills/driving-xmsg/SKILL.md archives/skills/README.md agents/skills/README.md tools/shared/evidence/xmsg-skill-replacement-20261021.md` | 1 | Existing archive-index line 61 links to absent `agents/skills/sui-move/LOCAL-NOTES.md`; unchanged and outside this ticket's purpose. |
| `rumdl check --no-exclude agents/skills/driving-xmsg/SKILL.md agents/skills/README.md tools/shared/evidence/xmsg-skill-replacement-20261021.md` | 0 | All three changed documents pass. |
| `sed -n '1,12p' archives/skills/README.md \| rumdl check --no-exclude --stdin-filename archives/skills/README.md -` | 0 | Changed retirement table and its links pass with archive exclusions disabled. |

Routed lexical inspection: `rr files '**/AGENTS.md'` showed no nearer policy files in the
affected directories. `rr text 'messaging-codex-sessions'` initially found only the frozen
active source; after retirement it found only the archive, archive index and this evidence.
No active caller outside the write scope was identified by this search. The deployed skill
listed in this worker's starting context is a runtime copy, not proof that sync has removed it.
The coordinator must compare the published archive hash before removing the original default
workspace file, then verify deployed discovery separately. No live send validation was run.
