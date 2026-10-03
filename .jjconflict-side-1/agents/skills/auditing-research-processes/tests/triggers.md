# Trigger desk-check

Read only the name and description before classifying each row. Re-run after description changes.

## FIRE

| Ask | Expected |
|---|---|
| "The failed optimisation episode is closed. Audit whether its run denominator was retained; packet is at `research/e17/`." | FIRE |
| "停止した研究セクションについて、凍結した intent と receipt を使って研究プロセス監査して。" | FIRE |
| "Before we archive this aborted study, produce an evidence-bounded retrospective; these are the terminal receipts." | FIRE |
| "We have a bounded episode audit request, not a new plan: was evaluator access earlier than candidate freeze?" | FIRE |
| "This result looked good, but the episode has ended. 研究の事後検証で process integrity と限界を分けてください。" | FIRE |
| "The frozen audit is complete; make the declassified recommendation without exposing its section review." | FIRE |

## MUST-NOT-FIRE / near misses

| Ask | Expected route |
|---|---|
| "The director is live now; propose a new training method." | `directing-research-sections` |
| "この論文の結論は支持できる？" | `arguing-research-papers` |
| "Our Bun hook failed after dispatch; postmortem it." | `operating-the-harness` / implementation owner |
| "Which open issue should the programme pursue next?" | `supervising-research-programmes` |
| "We have no closed episode or evidence locators; review the whole research history." | no-fire; request a bounded frozen packet |
| "Search the literature for alternative mechanisms." | `systematizing-knowledge` |
| "Send the full audit and its raw section transcript to the Supervisor." | no-fire; declassify only `AUDIT_RECOMMENDATION` |
