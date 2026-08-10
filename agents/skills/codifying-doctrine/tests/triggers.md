# F3 trigger desk-check — `codifying-doctrine`

Read only the target `name` and `description` before classifying a row. Do not load the body to
rescue an ambiguous row. `Expected` is the author-visible oracle; contested rows escalate to a
live eval and get recorded in `forge-verification-ledger.md`.

Re-run this table after ANY description edit.

## Should fire

| ID | Query | Expected | Why |
|---|---|---|---|
| F1 | 「うちのチーム、品質とスピードでいつも揉める。人によって判断が違うので指針を作りたい」 | FIRE | Recurring conflict between two defended values, resolved differently by different actors. STEP 0 passes. |
| F2 | We keep having the same argument about whether a flaky test blocks a release. Write us a rule that settles it. | FIRE | Recurring, contested, and the ask is explicitly for a tie-break. |
| F3 | 「SF の勢力設定でドクトリンを作りたい。資源が乏しい小国の想定」 | FIRE | Worldbuilding faction doctrine — the machinery (sacrifice, regime, obsolescence) transfers; `canon.md` §5 declares no source surface was swept for it. |
| F4 | Our leadership principles page hasn't changed anyone's behavior in two years. Audit it. | FIRE | Audit of an existing doctrine; the twelve tells and D4/D5 are owned here. |
| F5 | 「時差があってすぐには確認が取れない。連絡がつかないときに各自がどう動くかを決めておきたい」 | FIRE | Situation described with no headline keyword. This is the delegation boundary and default-on-silence. |
| F6 | Here's our engineering handbook's "How we decide" section — is any of this actually binding? | FIRE | D5 question verbatim: does a binding surface exist. |
| F7 | 「Amazon の Leadership Principles みたいなものをうちにも作って」 | FIRE | Authoring request naming a worked shape; `canon.md` §3 supplies it with its caveats. |
| F8 | The on-call runbook covers the known cases. What should people do when it's a case the runbook doesn't cover? | FIRE | The doctrine question in disguise — the runbook is the SOP, this asks for what governs outside it. |
| F9 | 「この行動指針、『A も B も大事』としか書いてなくて使えない。直して」 | FIRE | Trade-off erasure named by the user; D1 owns the fix. |
| F10 | Codify how we choose between shipping and refactoring, and make it actually stick. | FIRE | "Make it stick" is the D5 ask. |

## Near-miss — should NOT fire

| ID | Query | Expected | Route that remains |
|---|---|---|---|
| N1 | Should we use Postgres or SQLite for this service? | NO-FIRE | One decision, not a class. Decide it. |
| N2 | 「デプロイ手順を SKILL.md にまとめておいて」 | NO-FIRE | A procedure for one executor → `forging-skills`. |
| N3 | Add a rule: never force-push to main. | NO-FIRE | Universally-bad act = guardrail → `operating-the-harness` for the hook. |
| N4 | 「CLAUDE.md に書いたルールが守られない。なぜ？」 | NO-FIRE | Enforcement mechanics → `operating-the-harness` alone. |
| N5 | Explain what military doctrine is. | NO-FIRE | Explainer — answer directly. Ceremony here is this skill failing its own STEP 0. |
| N6 | Our engineering handbook repeats itself and references forward. Reorganize it. | NO-FIRE | Rules settled, information needs moving → `structuring-documents`. |
| N7 | Review this Rust PR for a concurrency risk before we ship it. | NO-FIRE | Applying a risk discipline → `practicing-tiger-style` / `writing-rust`. |
| N8 | Our values page needs better wording for the careers site. | NO-FIRE | Audience-facing prose → `linting-prose`. Fires here ONLY if the user wants it to bind. |
| N9 | Spawn 5 agents to review these files and collect the results. | NO-FIRE | Dispatch → `orchestrating-agents`. |
| N10 | What does the Powell Doctrine actually say? | NO-FIRE | Factual question — answer it, applying `canon.md` §4's name-without-a-document check silently. |
| N11 | 「うちのチームの価値観を3つ、標語っぽく考えて」 | NO-FIRE | Slogans with no binding intent. Offer STEP 0 once; if the user wants slogans, give slogans. |

## Co-fire and order

| ID | Query | Expected order | Rationale |
|---|---|---|---|
| C1 | 「判断基準を決めて、CLAUDE.md と hook に落としてほしい」 | `codifying-doctrine` → `operating-the-harness` | Doctrine authored here; the enforcement surface is installed there. The PURPOSE cut resolves it. |
| C2 | Build our autonomy doctrine from these 40 papers on self-managing teams. | `systematizing-knowledge` → `codifying-doctrine` | Never rule-ify an unreconciled corpus; the signed position distills into rules here. |
| C3 | Reforge `codifying-doctrine/SKILL.md` — the description is racing with operating-the-harness. | `forging-skills` ALONE | The craft owner of this file is `forging-skills`; the domain skill is the audit subject, not the craft owner. |
| C4 | 「このドクトリン、暗黙に前提しているものを洗い出して」 | `codifying-doctrine` → `surfacing-blind-spots` | Stated REGIME is D2 here; UNSTATED premises are theirs. |
| C5 | Adopting mission command across the whole org is a big, hard-to-reverse bet. Should we? | `acting-on-hypotheses` → `codifying-doctrine` | The adoption bet is theirs; authoring and auditing the artifact is here. |
| C6 | Our doctrine draft reads like corporate mush — fix the writing AND the trade-offs. | `codifying-doctrine` → `linting-prose` | Trade-offs first: polishing a rule that names no sacrifice polishes decoration. |

## Known trigger risks (watch on reforge)

- **`operating-the-harness` race.** Both descriptions carry "rule". The PURPOSE cut sits in both
  routing tables; if a `CLAUDE.md`-shaped ask starts firing here, tighten this description's
  install-vs-bind clause rather than adding keywords.
- **`forging-skills` race.** Both carry "LAW", "gate", "artifact". The description leads with
  DOCTRINE and names `forging-skills` as this file's own craft owner, which is what resolves C3.
- **Over-firing on explainers.** N5 and N10 are the rows most likely to regress, because the
  description is keyword-dense on "doctrine". If either flips, the fix is a sharper MUST-NOT-FIRE
  clause in the description, not a shorter body.
