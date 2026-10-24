# Archived skills

Skills retired from `agents/skills/`. Nothing here is linked into any agent (`mise run link:skills`
only reads `agents/skills/`), so an archived skill never fires; the directory keeps the text
reachable without `git log`.

## 2026-10-24 upstream replacement

| Skill | Archived | Why | Successor |
|---|---|---|---|
| [`driving-xmsg`](driving-xmsg/SKILL.md) | 2026-10-24 | Owner-requested retirement after agx 1.5.0 shipped its own messaging/dispatch skill; the in-house text is preserved outside discovery | `driving-agx` from `fuyutarow/agx`, declared in [`agents/skills.thirdparty.toml`](../../agents/skills.thirdparty.toml) |

## 2026-10-23 owner rule: no project names

| Skill | Archived | Why | Successor |
|---|---|---|---|
| [`driving-polysearch-v1`](driving-polysearch-v1/SKILL.md) | 2026-10-23 | Owner rule: dotfiles must not contain proper nouns of the operator's other projects; the project is frozen and the skill drives its CLI | none; the project's own repository owns its CLI usage |

## 2026-10-22 owner-requested retirement

| Skill | Archived | Why | Successor |
|---|---|---|---|
| [`implementing-and-debugging`](implementing-and-debugging/SKILL.md) | 2026-10-22 | Owner-requested retirement; complete two-file historical package preserved byte-identically outside discovery | No new replacement skill. Ordinary work follows repository instructions and existing language/domain owners. |

The archived name is a historical reference only: never call or automatically re-enable it.
The package contains only the historical manual and verification ledger, with no executable consumer.

## 2026-10-21 owner-requested retirement

| Skill | Archived | Why | Successor |
|---|---|---|---|
| [`messaging-codex-sessions`](messaging-codex-sessions/SKILL.md) | 2026-10-21 | Owner-requested retirement; exact frozen source preserved, active Codex-only entrypoint removed | `driving-agx` from `fuyutarow/agx`, declared in [`agents/skills.thirdparty.toml`](../../agents/skills.thirdparty.toml), now owns the upstream messaging/dispatch guidance. |
| [`operating-the-harness`](operating-the-harness/SKILL.md) | 2026-10-21 | Owner-requested retirement; callable guidance and mandatory invocation were removed | No replacement skill. Use each repository's declared configuration and executable checks; `scripts/harness/` retains the two shared checks. |

The archived package retains the complete historical source, including copies of the two check
scripts. The live executable owners are [`scripts/harness/scope-check.ts`](../../scripts/harness/scope-check.ts)
and [`scripts/harness/gate-diagnostics-check.ts`](../../scripts/harness/gate-diagnostics-check.ts).

| Skill | Archived | Why | Successor |
|---|---|---|---|
| `sandbox-sdk` | 2026-09-27 | Removed upstream: cloudflare/skills replaced it on 2026-08-07 (PR #92, f96bff7) with skills of different names | `sandbox-stable`, `sandbox-next`, `sandbox-migrate-to-next` in cloudflare/skills (not vendored here) |
| `turnstile-spin` | 2026-09-27 | Never invoked here (no recorded use); its worker template targets Cloudflare Workers, where Temporal is unconfirmed, so it could not meet the repo-wide Date ban without risking deployed customer Workers | still current upstream: `skills/turnstile-spin` in cloudflare/skills — re-vendor from there if needed |

## 2026-10-03 unused-skill retirement

Retired after zero recorded invocations in the supplied usage snapshot and more than 30 days since repository admission. Sources remain intact. Additions from the last 30 days are retained.

Archived names in an active manual refer to the contract below; read the archived source when that contract is needed. Do not call or automatically re-enable a retired skill. Executable tools remain with their existing owners.

| Skill | First repository admission | Archived | Reason |
|---|---|---|---|
| [`agents-sdk`](agents-sdk/SKILL.md) | 2026-06-19 | 2026-10-03 | 0 recorded uses; beyond newcomer grace |
| [`arguing-research-papers`](arguing-research-papers/SKILL.md) | 2026-07-08 | 2026-10-03 | 0 recorded uses; beyond newcomer grace |
| [`cloudflare`](cloudflare/SKILL.md) | 2026-06-19 | 2026-10-03 | 0 recorded uses; beyond newcomer grace |
| [`cloudflare-email-service`](cloudflare-email-service/SKILL.md) | 2026-06-19 | 2026-10-03 | 0 recorded uses; beyond newcomer grace |
| [`cloudflare-one`](cloudflare-one/SKILL.md) | 2026-06-19 | 2026-10-03 | 0 recorded uses; beyond newcomer grace |
| [`cloudflare-one-migrations`](cloudflare-one-migrations/SKILL.md) | 2026-06-19 | 2026-10-03 | 0 recorded uses; beyond newcomer grace |
| [`directing-research-sections`](directing-research-sections/SKILL.md) | 2026-08-04 | 2026-10-03 | 0 recorded uses; beyond newcomer grace |
| [`durable-objects`](durable-objects/SKILL.md) | 2026-06-19 | 2026-10-03 | 0 recorded uses; beyond newcomer grace |
| [`linting-sui-move`](linting-sui-move/SKILL.md) | 2026-07-04 | 2026-10-14 | Restored for source review, then replaced by official Mysten Labs packages; no distinct authored capability demonstrated |
| [`mintlify`](mintlify/SKILL.md) | 2026-08-15 | 2026-10-03 | 0 recorded uses; beyond newcomer grace |
| [`operationalizing-research-gaps`](operationalizing-research-gaps/SKILL.md) | 2026-08-06 | 2026-10-03 | 0 recorded uses; beyond newcomer grace |
| [`prompting-llms`](prompting-llms/SKILL.md) | 2026-07-03 | 2026-10-03 | 0 recorded uses; beyond newcomer grace |
| [`recovering-poisoned-context`](recovering-poisoned-context/SKILL.md) | 2026-07-01 | 2026-10-03 | 0 recorded uses; beyond newcomer grace |
| [`securing-remote-access`](securing-remote-access/SKILL.md) | 2026-06-19 | 2026-10-03 | 0 recorded uses; beyond newcomer grace |
| [`workers-best-practices`](workers-best-practices/SKILL.md) | 2026-06-19 | 2026-10-03 | 0 recorded uses; beyond newcomer grace |
| [`wrangler`](wrangler/SKILL.md) | 2026-06-19 | 2026-10-03 | 0 recorded uses; beyond newcomer grace |
| [`driving-serena`](driving-serena/SKILL.md) | 2026-07-28 | 2026-10-03 | 0 recorded uses; beyond newcomer grace |

Recent unused additions retained: `driving-jev` and `typesafe-ai` (2026-09-21), `operating-wsl2-on-windows` (2026-09-17), and `validating-experimental-evidence` (2026-09-25).

Restore only on an explicit request: move the complete directory back to `agents/skills/`, restore its catalog and vendor-ledger entry where applicable, then run `mise run link:skills` and the skill floor.

## Restored

`transcribing-media` was restored to `agents/skills/` on 2026-10-03 at the user's request.

`linting-sui-move` was restored and researched on 2026-10-14, then retired again after
the user questioned the need for an independent authored guide. Its source-review history
is preserved here. Nine official packages now own ordinary Sui source development.
BCS review knowledge remains in the existing soks position/ledger; pinned corrections and
deployment provenance live in [the official package integration notes](../../agents/skills/sui-move/LOCAL-NOTES.md).
The archived guide is historical evidence, not an active overlay. It has no vendor-ledger entry.

## 2026-10-06 absorbed-skill retirement

Retired after their worker and Jev implementations moved into `agents/routing-control/`; dispatch
and Jev now have the single entrypoint `agent-router`.

| Skill | First repository admission | Archived | Reason |
|---|---|---|---|
| [`driving-codex`](driving-codex/SKILL.md) | 2026-07-12 | 2026-10-06 | Absorbed by agent-router; the code lives in `agents/routing-control` |
| [`driving-claude`](driving-claude/SKILL.md) | 2026-07-23 | 2026-10-06 | Absorbed by agent-router; the code lives in `agents/routing-control` |
| [`driving-jev`](driving-jev/SKILL.md) | 2026-09-21 | 2026-10-06 | Absorbed by agent-router; the code lives in `agents/routing-control` |
