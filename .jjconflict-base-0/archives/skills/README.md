# Archived skills

Skills retired from `agents/skills/`. Nothing here is linked into any agent (`mise run link:skills`
only reads `agents/skills/`), so an archived skill never fires; the directory keeps the text
reachable without `git log`.

| Skill | Archived | Why | Successor |
|---|---|---|---|
| `sandbox-sdk` | 2026-09-27 | Removed upstream: cloudflare/skills replaced it on 2026-08-07 (PR #92, f96bff7) with skills of different names | `sandbox-stable`, `sandbox-next`, `sandbox-migrate-to-next` in cloudflare/skills (not vendored here) |
| `turnstile-spin` | 2026-09-27 | Never invoked here (no recorded use); its worker template targets Cloudflare Workers, where Temporal is unconfirmed, so it could not meet the repo-wide Date ban without risking deployed customer Workers | still current upstream: `skills/turnstile-spin` in cloudflare/skills — re-vendor from there if needed |
