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

## MUST NOT FIRE

| Ask | Route |
|---|---|
| 「この一つの設計書で重複している節をまとめ、章順を直して」 | `structuring-documents` |
| “Polish this paragraph for an external reviewer and remove LLM-like wording.” | `linting-prose` |
| 「この40本の論文をknown/uncertain/disputedに整理して」 | `systematizing-knowledge` |
| “Review whether this finished paper overclaims its novelty and evidence.” | `arguing-research-papers` |
| 「次に登る研究テーマを選び、研究プログラムを配分して」 | `directing-research` |
| “Keep this multi-session implementation task resumable after compact.” | `continuing-long-running-tasks` |
| 「Obsidianを入れてMarkdownを閲覧できるようにして」 | product/setup work; no governance question yet |
| “Install OpenWiki and generate its default code wiki.” | product/setup owner; co-fire here only if admission/authority policy is also requested |
| 「このREADMEにAPIの使い方を一節追加して」 | ordinary single-document authoring/domain owner |
| “Configure a Stop hook to run an already-defined documentation check.” | `operating-the-harness` |

## Ordered co-fire

| Braided ask | Order |
|---|---|
| design R&D documentation norms and then wire CI | HERE fixes admission/profile semantics → `operating-the-harness` chooses repo-local mechanism → HERE runs acceptance |
| admit a canonical from a literature corpus | `systematizing-knowledge` establishes evidence position → HERE decides authority/lifecycle → reviewer decides |
| create a reviewable paper claim and govern surrounding artifacts | `arguing-research-papers` owns manuscript claim → HERE owns review request, evidence links, and generated packet expiry |
| restructure a newly admitted canonical | HERE admits or chooses update → `structuring-documents` moves information → `linting-prose` rewrites in place → HERE checks lifecycle |
| preserve task state and permanent research state | `continuing-long-running-tasks` owns one transient task record; HERE separately owns permanent R&D artifacts; neither substitutes for the other |

## Regression predicate

The description must retain:

- research-repository portfolio scope;
- the six actions `create | update | derive | freeze | retire | delete`;
- one active authority per research question;
- immutable evidence/negative results and disposable generated views;
- a review contract with decision, questions, evidence, and acceptance criteria;
- an explicit OKF/profile distinction;
- cuts to the six nearest content/state siblings and product installation;
- the final language directive.

It must not imply that OKF conformance, a wiki tool, or the deterministic checker proves document
quality or scientific truth.
