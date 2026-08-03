# Route-only compatibility-shim trigger desk-check

Read only the `name` and `description` of the research-family skills. `directing-research` (`D`) is
a compatibility router, not a fourth semantic owner. Specific asks invoke their owner directly.

## FIRE — legacy broad or ambiguous asks enter D only for a routing decision

| # | Realistic ask | Expected route | Why D fires |
|---|---|---|---|
| 1 | 「研究を進めて。何から始めるかも、実験後の振り返りもまだ決めていない」 | `D -> supervising-research-programmes`; later owners only when their entry state exists | bare legacy invocation has no explicit state |
| 2 | “Use the old directing-research workflow for this new project, but route it to the current system.” | `D -> supervising-research-programmes` | explicitly requests the retired entrypoint and a compatibility route |
| 3 | 「創造的研究を、問いづくりから局所実験、終了後の監査までどう運転する？」 | `D -> supervising-research-programmes -> directing-research-sections -> auditing-research-processes` | mixed end-to-end ask needs owner ordering; each later gate remains conditional |
| 4 | “I have a programme question, a live section request, and a completed episode to inspect; who owns what?” | `D` emits one three-owner `ROUTING DECISION`, then stops | mixed ownership classification is the shim's sole artifact |
| 5 | 「旧 v1 の intent/receipt/judgment が残っている。読める状態を保ちつつ、今の担当に振り分けて」 | `D` preserves immutable v1 compatibility, then routes the new semantic question by state | explicit compatibility/readability request |
| 6 | “Help plan and run this research effort; I don't know whether it is programme design, section work, or an audit yet.” | `D` classifies the earliest explicit state and routes once | genuinely ambiguous legacy broad ask |

## NO-FIRE — specific asks bypass D

| # | Realistic ask | Direct owner | Boundary |
|---|---|---|---|
| 1 | “Reconstruct the programme problem landscape and decide which open issues deserve allocation.” | `supervising-research-programmes` | programme/frame/portfolio meaning |
| 2 | 「現在の OPEN_ISSUE に bid して、この SECTION_MANDATE 内で次の run intent を登録して」 | `directing-research-sections` | one section's bid/intent loop |
| 3 | “Audit this frozen failed episode against its intents, receipts, and denominator.” | `auditing-research-processes` | terminal bounded process audit |
| 4 | “What do these sixty papers establish?” | `systematizing-knowledge` | corpus position |
| 5 | “Is this residual real or a pipeline artifact?” | `raising-resolution` | one present factual row |
| 6 | 「この既存計画の暗黙の前提を掘って。解決策はまだ出さないで」 | `surfacing-blind-spots` | premise exposure only |
| 7 | “Generate a batch of thesis candidates for this selected frame.” | `forging-novel-theses` | candidate genesis, not admission |
| 8 | “Precommit the cheapest discriminating test for this expensive irreversible selected bet.” | `acting-on-hypotheses` | one costly load-bearing tree |
| 9 | “Turn these completed results into one defensible paper claim.” | `arguing-research-papers` | finished claim |
| 10 | “Which research documents are authoritative, retained, or retired?” | `governing-research-documentation` | document lifecycle |
| 11 | “Keep this task resumable across compact and executor handoff.” | `continuing-long-running-tasks` | continuity transport |
| 12 | “Choose bearers, visibility, vetoes, and acceptance for this signed research map.” | `orchestrating-agents` | control-plane overlay |
| 13 | “Postmortem this generic production outage and fix its root cause.” | `implementing-and-debugging` | software incident, not research audit |

## Co-fire and stop checks

- `D` may order owners for a mixed ask; it never co-authors their artifacts.
- `supervising-research-programmes` stops before section method, candidate, protocol, intent, or run.
- `directing-research-sections` stops before programme mutation and terminal process audit.
- `auditing-research-processes` returns a non-enacting recommendation and never directs live work.
- Documentation, continuity, and orchestration compose after their domain inputs exist; none receives
  research-semantic ownership from `D`.
- The operational North Star belongs to the new family: valid SEARCH receipts/hour plus
  receipt-linked LEARN commits/hour. `D` neither calculates nor optimizes it.

Any row that makes `D` write a programme, section, run, candidate, audit, retrospective, metric value,
or transition is a collection-level failure.
