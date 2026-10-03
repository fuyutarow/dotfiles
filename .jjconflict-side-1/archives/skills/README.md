# Archived skills

Skills retired from `agents/skills/`. Nothing here is linked into any agent (`mise run link:skills`
only reads `agents/skills/`), so an archived skill never fires; the directory keeps the text
reachable without `git log`.

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
| [`linting-sui-move`](linting-sui-move/SKILL.md) | 2026-07-04 | 2026-10-03 | 0 recorded uses; beyond newcomer grace |
| [`mintlify`](mintlify/SKILL.md) | 2026-08-15 | 2026-10-03 | 0 recorded uses; beyond newcomer grace |
| [`operationalizing-research-gaps`](operationalizing-research-gaps/SKILL.md) | 2026-08-06 | 2026-10-03 | 0 recorded uses; beyond newcomer grace |
| [`prompting-llms`](prompting-llms/SKILL.md) | 2026-07-03 | 2026-10-03 | 0 recorded uses; beyond newcomer grace |
| [`recovering-poisoned-context`](recovering-poisoned-context/SKILL.md) | 2026-07-01 | 2026-10-03 | 0 recorded uses; beyond newcomer grace |
| [`securing-remote-access`](securing-remote-access/SKILL.md) | 2026-06-19 | 2026-10-03 | 0 recorded uses; beyond newcomer grace |
| [`transcribing-media`](transcribing-media/SKILL.md) | 2026-07-05 | 2026-10-03 | 0 recorded uses; beyond newcomer grace |
| [`workers-best-practices`](workers-best-practices/SKILL.md) | 2026-06-19 | 2026-10-03 | 0 recorded uses; beyond newcomer grace |
| [`wrangler`](wrangler/SKILL.md) | 2026-06-19 | 2026-10-03 | 0 recorded uses; beyond newcomer grace |
| [`driving-serena`](driving-serena/SKILL.md) | 2026-07-28 | 2026-10-03 | 0 recorded uses; beyond newcomer grace |

Recent unused additions retained: `driving-jev` and `typesafe-ai` (2026-09-21), `operating-wsl2-on-windows` (2026-09-17), and `validating-experimental-evidence` (2026-09-25).

Restore only on an explicit request: move the complete directory back to `agents/skills/`, restore its catalog and vendor-ledger entry where applicable, then run `mise run link:skills` and the skill floor.
