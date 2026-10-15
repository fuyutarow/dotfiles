+++
schema = 2
name = "ratecontext"
outcome = "agx's router sees each route's subscription usage (claude 5h and 7d, codex 7d: used percent, time to reset, window length) from the same source the statusline uses, and prefers the route whose quota would otherwise expire unused: a route below its linear pace with little time left is favored, a route above pace is disfavored; the standing 'codex first when comparable' rule is replaced by this pace rule in the roster and the rendered CLAUDE.md block"
writes = ["tools/agx/**", "agents/models/dispatch-roster.toml", "scripts/render-home.ts", "scripts/tests/render-home.test.ts", "tools/shared/**", "tools/*/.changes/*.md"]
verify = ["bun test tools/agx", "bun test scripts/tests/render-home.test.ts", "mise run gate:land"]
timeout_s = 2400
premises = ["file:tools/agx/src/next/route.ts", "file:agents/models/dispatch-roster.toml"]

[proposition]
id = "ROUTE-BY-PACE"
claim = "given claude 7d used 3% with 94% of its window elapsed and codex 7d used 45% with 28% elapsed, the routing request carries those numbers and a capability-eligible claude row is chosen over a comparable codex row"
refuted_by = "the Jev request still hardcodes routes {available: true}, or the replayed case picks the codex row, or a route above its weekly limit is still offered"
+++

Owner (2026-10-15): "claude should be chosen more than codex … with 3% consumed and reset in 9h33m, claude should be
prioritized; the way usage/rate-limit context is given is in doubt." Statusline at that moment:
  Rate: claude 5h 12% ⟳13:40 (0h14m, 95% of window elapsed) · 7d 3% ⟳10-15 23:00 (9h34m, 94% elapsed) |
        codex 7d 45% ⟳10-20 13:58 (5d0h, 28% elapsed)
All five running workers were luna (codex) rows.
Fact: tools/agx/src/next/route.ts:43 sends `routes: { codex: { available: true }, claude: { available: true } }`
unconditionally; no usage reaches Jev. The rendered ~/.claude/CLAUDE.md says "when codex and claude rows are
comparable, choose codex" (source: find it; it is rendered from the roster or agents/claude/CLAUDE.md).
Do:
1. One reader of usage: reuse the statusline's existing rate sources (tools/statusline/src/rate-limits.ts,
   codex-rate.ts) through tools/shared or a snapshot file they already write; do not add a second fetcher. Output per
   route and window: used_percent, resets_at, window_seconds, elapsed_fraction, pace = used_percent/100 -
   elapsed_fraction, and stale/unknown.
2. Route request: send these per route under state.routes.<route> instead of the constant; mark a route unavailable
   when any window is at or above its limit. Add a criterion that tells Jev to prefer the route with the most
   negative pace among capability-eligible rows (quota that would otherwise expire), and to avoid a route with
   positive pace when a comparable row exists on the other route. Unknown usage = neutral, said explicitly.
3. Replace the codex-first sentence in the roster/rendered block with the pace rule (keep the TB4 floor and capability
   rules from agxroute). Show before/after.
4. Tests: replay of the numbers above picks the claude row; a route over its limit is excluded; stale usage is neutral.
Probe against a temp AGX_NEXT_STATE_DIR. Do not commit or push.
