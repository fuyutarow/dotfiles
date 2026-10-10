# Trigger desk-check — F3 artifact

Run against this description and the named sibling descriptions after every trigger edit.

## FIRE

| Ask | Why it fires |
|---|---|
| “A visitor consented to route this method note. Match it to one Director need and offer it privately.” | consented encounter → one pre-admission offer |
| 「研究者の提案を、同意範囲だけで特定 Section に技術メモとして届けたい」 | 研究交流の仲介 with scoped voluntary routing |
| “Create an encounter record, declassify the bounded note, and exact-match its keys to this need.” | three broker artifacts and deterministic matching |
| “For the Idea Factory pilot, freeze an encounter offer and its no-adoption receipt.” | pilot’s encounter lifecycle |
| “The Director has not admitted anything; let them pull this human method input if they choose.” | voluntary `PULL` before local admission |
| “Consent revision 4 permits only Section K. Replaying the offer must return its original ID.” | recipient scope and idempotent replay |
| 「期限切れの技術メモ・オファーを、科学的成果にせず immutable receipt で閉じる」 | terminal non-credit expiry |
| “The source withdrew after a pull but before admission; preserve history and close the receipt.” | withdrawal branch before local admission |
| “Yesterday a visitor mentioned a bounded method, and Section K already wrote down the exact problem it needs help with; can K see it without anyone treating it as a decision?” | messy keyword-free pre-admission encounter route |
| “Broadcast this useful encounter memo everywhere and wait for acknowledgements.” | fires to enforce recipient binding, no broadcast, and no global barrier |
| “Our shadow pilot has ten offers; declare scientific productivity.” | fires to deny credit and keep shadow structural-only |
| “Count memo tokens, delivery retries, and agent fan-out as LEARN.” | fires to enforce the metric/credit boundary |
| 「同意は曖昧だが、似た課題へ semantic search して送って」 | fires to stop inferred consent and non-exact routing |

## MUST NOT FIRE / near misses

| Ask | Route / reason |
|---|---|
| “Read these papers and tell us the field’s settled position.” | `systematizing-knowledge` owns corpus → position |
| 「この offer を受けて HUMAN-METHOD-INPUT を記録し、ADMIT / REJECT / DEFER を決める」 | `directing-research-sections` owns local pull and admission |
| “Turn the memo into three thesis candidates and start a test.” | `forging-novel-theses`, then section direction; no auto candidate/run |
| 「Section の LEARN を packet 化して subscribers に配送する」 | committed-learning transfer belongs to `directing-research-sections` |
| “Show the Programme Supervisor the raw conversation and need body.” | raw-upward visibility is prohibited; programme work routes to `supervising-research-programmes` |
| “Write the programme mandate from this impressive encounter.” | encounter creates no programme action; `supervising-research-programmes` |
| “Archive, supersede, and retire the canonical research record.” | `governing-research-documentation` owns durable lifecycle |
| “Implement a generic persistent matcher, webhook, and retry queue unrelated to research encounters.” | runtime implementation → `implementing-and-debugging` plus platform owner |
| “How should Bell Labs office corridors influence our interior design?” | ordinary organizational/workplace analysis; not encounter brokerage |
| “Assign five agents to review these already-frozen artifacts.” | `orchestrating-agents` owns dispatch topology |
| “Rename this research memo and set its retirement date.” | `governing-research-documentation` owns document lifecycle |

## Co-fire order

When a request includes corpus synthesis, first use `systematizing-knowledge`; when it includes a
voluntary pulled offer, this skill stops and `directing-research-sections` owns the local act. Co-fire
with `orchestrating-agents` only for dispatch topology, never to rewrite this skill’s semantic map.
Implementing this specific encounter broker later co-fires this skill for the domain contract, then
`implementing-and-debugging` and the platform owner own code/runtime changes. The present Skill and
pilot do not authorize that implementation.
