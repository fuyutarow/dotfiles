# Fire / no-fire desk-check — gate F3

Desk-check protocol (`forging-skills/references/triggering.md` §5): read ONLY `name:` +
`description:`, answer fire/no-fire/co-fire, then check against the expected column. Re-run
after any description edit.

## Should FIRE (≥5, realistic/messy, ≥1 Japanese, ≥1 without a headline keyword)

| # | Query | Why it fires | Desk-check |
|---|---|---|---|
| 1 | 「うちのR&D repoでもDirector/PI/Researcher体制を立ち上げたい。dotfilesのskillと協調してほしい」 | names the roles + explicit request to coordinate with the skill | FIRE — matches "Director/PI/Researcher体制" |
| 2 | "Why did all six of our PI sessions stall yesterday? Walk me through the launch checklist." | "launch checklist" + "PI" | FIRE |
| 3 | 「PIが検収をDirectorに投げてる。これ直して」 — situational, no headline keyword, no skill name spoken | matches the in-lab-verification content ("Director" + implicit checklist/charter violation) via role vocabulary, not a literal trigger phrase — the hardest row; if this desk-checks NO-FIRE, widen the description before shipping | FIRE (contested — verify live, `forging-skills/references/triggering.md` §6) |
| 4 | "Write the order form for phase 20, I keep forgetting the shape — 00_base plus what again?" | "order form" + phase-number shape | FIRE — matches 発注書の型 |
| 5 | 「うちのDirectorがつい設計に口出ししちゃうんだけど、憲章的にどうなの」 — backstory clutter, no skill name | "Director" + 憲章 | FIRE |
| 6 | "What's the difference between retrieve and search in this project's vocabulary?" | matches the retrieve/search cut directly | FIRE |

## Should NOT fire (≥5, near-miss, names what fires instead)

| # | Query | Fires instead | Desk-check |
|---|---|---|---|
| 1 | 「うちのprogrammeのOPEN_ISSUEを設計して」 | `supervising-research-programmes` | NO-FIRE |
| 2 | 「このsectionのcharterを書いて、admissionを判断して」 | `directing-research-sections` | NO-FIRE |
| 3 | "Dispatch three agents in parallel and verify their output" — generic, no Director/PI/Researcher role content | `orchestrating-agents` alone | NO-FIRE |
| 4 | 「うちのチームの行動指針を作りたい。優先順位でよく揉める」 — no named executor role, a cross-actor tie-break | `codifying-doctrine` | NO-FIRE |
| 5 | "Add a rule that force-pushing to main is never allowed in this session" | `operating-the-harness` (a guardrail, not a role charter) | NO-FIRE |
| 6 | 「終わった実験のprocess auditをして」 | `auditing-research-processes` | NO-FIRE |

## Co-fire

| # | Query | Order | Desk-check |
|---|---|---|---|
| 1 | 「PIとResearcherをdispatchして、検収まで回して」 | this skill (role content, prohibitions, in-lab verification) FIRST, then `orchestrating-agents` (the actual dispatch mechanics) | CO-FIRE, this skill first |
| 2 | "Reforge commanding-research-fleets, the description feels stale" | `forging-skills` (craft owner) alone — this skill's own routing table names it explicitly | `forging-skills` FIRE, this skill NO-FIRE (it is the OBJECT, not the tool) |
