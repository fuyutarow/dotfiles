# Fire / no-fire desk-check — governing research documentation

Read only Skill names and descriptions. Any unresolved race is a description defect.

## FIRES

| Ask | Why here |
|---|---|
| 「この研究レポジトリで、書き残すべきことと残すと有害なことの規範を作って」 | cross-document admission and retention policy |
| 「似た『現在地』文書が三つある。どれを正本として保守し、どれを廃止する？」 | authority collision plus lifecycle decision |
| “Before writing another technical report, decide whether we should update, derive, or create.” | explicit new-document admission gate |
| 「査読を受けられる最低限の技術文書作法と、査読後の更新先を決めたい」 | review contract plus canonical handback |
| “Adopt OKF for this R&D repo, but make provenance, staleness, and authority merge-blocking.” | OKF exchange layer plus local governance profile |
| 「失敗実験とnegative resultを消さず、後続の主張から追跡できる形にして」 | immutable evidence and durable interpretation boundary |
| “Our generated wiki summaries keep becoming sources for later summaries; stop the drift.” | generated-view anti-authority and anti-self-reference policy |
| 「レビュー用の293行の要約は必要なのか、生成物として期限付きにすべきか判定して」 | derive/freeze decision and generated-view expiry |
| “Which research docs should be deleted, which deprecated, and which maintained?” | typed delete/retire/maintain adjudication |
| 「OKFではあるのに文書品質が低い、というポストモーテムを実装可能な規範へ変えて」 | base-standard/profile distinction plus harness floor |
| 「R&D文書をtype+年月+連番-IDとsnake_caseタイトルへ統一し、更新では再発番もrenameもさせないで」 | stable document identity, admission-time allocation, and deterministic naming floor |
| “Keep our DONOR SET, transfer bundle, TARGET RESULT, mapping breaks, and route disposition reviewable without inventing a fifth document role.” | lifecycle/authority boundary for existing transfer artifacts |
| “Only decide whether to create, update, freeze, retire, or delete these records and which one remains authoritative.” | explicit document admission, lifecycle, and authority; semantic content is already fixed |
| “The RUN INTENT, failed RUN RECEIPT, and frozen RESEARCH_PROCESS_AUDIT are semantically fixed; admit durable loci, retention, review, and retirement without changing their verdicts.” | durable research-run DOC ADMISSION plus negative-terminal preservation; semantics remain upstream |

## MUST NOT FIRE

| Ask | Route |
|---|---|
| 「この一つの設計書で重複している節をまとめ、章順を直して」 | `structuring-documents` |
| “Polish this paragraph for an external reviewer and remove LLM-like wording.” | `linting-prose` |
| 「この40本の論文をknown/uncertain/disputedに整理して」 | `systematizing-knowledge` |
| “Review whether this finished paper overclaims its novelty and evidence.” | `arguing-research-papers` |
| 「次に登る研究テーマを選び、研究プログラムを配分して」 | `supervising-research-programmes` |
| “Keep this multi-session implementation task resumable after compact.” | `continuing-long-running-tasks` |
| 「Obsidianを入れてMarkdownを閲覧できるようにして」 | product/setup work; no governance question yet |
| “Install OpenWiki and generate its default code wiki.” | product/setup owner; co-fire here only if admission/authority policy is also requested |
| 「このREADMEにAPIの使い方を一節追加して」 | ordinary single-document authoring/domain owner |
| 「このREADME.mdだけをread_me.mdへrenameして」 | ordinary repository rename; no R&D portfolio admission or identity decision |
| “Configure a Stop hook to run an already-defined documentation check.” | `operating-the-harness` |
| “Build a generic repository write tool for agents.” | reject the generic surface; only a future constrained apply design may be considered after repeated evidence |
| “Audit why this failed research episode changed our interpretation and decide whether the programme should reopen.” | `auditing-research-processes` audits the frozen episode → `supervising-research-programmes` independently decides whether to reopen; no durable-document request yet |
| “Choose agents, evidence visibility, vetoes, and acceptance timing for this documentation audit.” | `orchestrating-agents`; topology only, no lifecycle judgment |

## Ordered co-fire

| Braided ask | Order |
|---|---|
| design R&D documentation norms and then wire CI | HERE fixes admission/profile semantics → `operating-the-harness` chooses repo-local mechanism → HERE runs acceptance |
| admit a canonical from a literature corpus | `systematizing-knowledge` establishes evidence position → HERE decides authority/lifecycle → reviewer decides |
| create a reviewable paper claim and govern surrounding artifacts | `arguing-research-papers` owns manuscript claim → HERE owns review request, evidence links, and generated packet expiry |
| restructure a newly admitted canonical | HERE admits or chooses update → `structuring-documents` moves information → `linting-prose` rewrites in place → HERE checks lifecycle |
| preserve task state and permanent research state | `continuing-long-running-tasks` owns one transient task record; HERE separately owns permanent R&D artifacts; neither substitutes for the other |
| turn corpus observations into a transfer-governed route | `systematizing-knowledge` freezes DONOR SET → `forging-novel-theses` maps/breaks → `directing-research-sections` disposes locally → HERE governs authority, lineage, review, and retirement only |
| synthesize a corpus and designate its result as canonical authority | `systematizing-knowledge` signs the calibrated position → HERE runs DOC ADMISSION and decides authority/lifecycle |
| audit a completed/failed/stopped/aborted research episode and retain its artifacts | `auditing-research-processes` signs the frozen audit and recommendation → `supervising-research-programmes` independently decides any programme transition → HERE admits durable run/audit loci and preserves negative terminal evidence |
| inventory a large document portfolio with several agents, then retire duplicates | HERE fixes the lifecycle question → `orchestrating-agents` owns actors/visibility/acceptance → HERE adjudicates DOC ADMISSION and retirement |

## Regression predicate

The description must retain:

- research-repository portfolio scope;
- the six actions `create | update | derive | freeze | retire | delete`;
- one active authority per research question;
- immutable evidence/negative results and disposable generated views;
- a review contract with decision, questions, evidence, and acceptance criteria;
- an explicit OKF/profile distinction;
- a profile-local stable ID/type-code naming contract without claiming a universal filename rule;
- cuts to the six nearest content/state siblings and product installation;
- the final language directive.

It must not imply that OKF conformance, a wiki tool, or the deterministic checker proves document
quality or scientific truth. It must not present `repo-search` as a frozen read, implement a generic
`repo-write`, or imply that a transfer artifact's lineage determines its target truth.
