+++
schema = 2
name = "agxroute"
outcome = "the router honors ticket capabilities and timeout: a long-tool-loop / terminal-agentic ticket with timeout_s in the hours is never routed to a row whose use_for or record says it is weak at long sessions, and a run that ends in under 2 minutes with no changed files and no RETURN counts as a failure in the lineage, so a retry picks a different row"
writes = ["tools/agx/**", "agents/models/dispatch-roster.toml"]
verify = ["bun test tools/agx", "bunx --bun tsgo --noEmit", "mise run gate:land"]
timeout_s = 1800
premises = ["file:agents/models/dispatch-roster.toml"]

[proposition]
id = "CAPS-ROUTE"
claim = "replaying firedancer's th_purge ticket (capabilities terminal-agentic, long-tool-loop, bulk-classification; timeout_s 14400) never selects luna-low/luna-medium"
refuted_by = "the replay test selects luna-medium, or two early-quit runs in a lineage do not mask that row"
+++

Peer report from firedancer (2026-10-14): ticket th_purge, a 4-hour repo-wide inventory with
capabilities = ["terminal-agentic", "long-tool-loop", "bulk-classification"] and timeout_s = 14400, was routed twice
to luna-medium (runs 620393f2, e6f15ef6). Both quit in 75–112 s with no work done.
Do:
1. Read both runs' records and the routing receipt read-only. Find WHY luna-medium won; luna-medium's use_for is "bulk
   read-only work", so "bulk" probably matched.
2. Make the declared capabilities a constraint, not a keyword hint. Map each capability tag to the rows whose measured
   use_for or record supports it (for example long-tool-loop / terminal-agentic → rows with TB4 ≥ some bound, or sol
   and above), and use timeout_s as a size signal.
3. Classify an early quit (< 120 s, 0 changed files, no RETURN, exit 0) as failed, not delivered, so lineage masking
   applies.
4. Replay test with th_purge's frontmatter. Read it from firedancer's ticket home read-only, or reconstruct it from
   the records.
Add a changeset. Do not commit or push.

## Current state (coordinator, 2026-10-15 14:00)
Run 9dc1f0a7 is accepted (TB4 floor, timeout as task size, early-quit masking without hot-path report reads). land
failed only on the changeset: tools/agx/.changes/caps-route.md contains
    bump: minor
    Constrain routing by measured task capabilities and timeout, and mask rows after early no-work quits.
without the frontmatter delimiters. Rewrite it to exactly:
    ---
    bump: minor
    ---

    Constrain routing by measured task capabilities and timeout, and mask rows after early no-work quits.
Then rebase this workspace onto alpha (`jj rebase -d alpha` here only) and re-run verify. Change nothing else.
