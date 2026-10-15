+++
schema = 2
name = "cccplanfix"
outcome = "`rr index --plan` refuses only for reasons a person should act on: exclude suggestions are offered only for data-kind contributors (never source code or prose), and the time estimate uses a measured embedding rate recorded from previous indexes on this host instead of an assumed constant"
writes = ["tools/repo-retrieve/**", "tools/*/.changes/*.md"]
verify = ["bun test tools/repo-retrieve", "bunx --bun tsgo --noEmit", "mise run gate:land"]
timeout_s = 1500
premises = ["file:tools/repo-retrieve/src/index-plan.ts", "rev:422d20d31f9e"]

[proposition]
id = "CCC-PLAN-ACTIONABLE"
claim = "for a code-dominated repo within the chunk and data budgets, the plan passes, and any suggested exclude line names a data-kind contributor"
refuted_by = "a fixture of a code-only repo within budget is refused, or a suggested exclude targets a code or markdown contributor, or the time estimate uses the constant when a measured rate exists"
+++

Live result after landing 422d20d3 (coordinator, 2026-10-15, firedancer with its new excludes):
    PLAN: 2883 files, 32441050 bytes, 41478 est_chunks (ceil(chars / 800)); data 18.5%; estimated GPU 829.6s at
          assumed 50 chunks/s
    BUDGET: {"max_est_chunks":50000,"max_data_share":0.2,"max_seconds":600,"est_chunks_per_second":50}
    PLAN REFUSED: estimated GPU seconds 829.6 > 600
    Top contributors; paste under exclude_patterns …:
    packages/ModelRegistry.jl/src (.jl): 6704 chunks, 16.2%, 150 files; - 'packages/ModelRegistry.jl/src/**/*.jl'
    agent-notes (.md): 5080 chunks, 12.2%, 94 files; - 'agent-notes/**/*.md'
    …
Two defects: (1) it suggests excluding source code and notes, which a user might paste and lose search over the code;
(2) it refuses on a time estimate from an unmeasured constant (50 chunks/s).
Do:
1. Suggestions only for kind=data contributors. Non-data contributors may be listed as information, without an
   exclude line. If a refusal has no data-kind contributor to suggest, say so and point at the budget setting.
2. Rate: record chunks/s at the end of each completed index (per host, under the repo-retrieve state dir) from ccc's
   counters and elapsed time; the plan uses the median of the last N measurements, falls back to the constant only
   when none exist, and prints which it used. The time-budget refusal applies only with a measured rate; with the
   constant it warns.
3. Tests for both. Do not run a real index. Do not commit or push.
