# Patterns — the six families in full

Arguing home for the six families (F-L1 word · F-L2 sentence · F-L3 paragraph · F-L4 document logic ·
F-register · F-lifecycle). SKILL.md states each family compactly with its layer and tier; this file
argues it, carries the full token lists, the old C1–C9 mapping (preserved as instances), the
terminology-table format, the ledgers, and the harness execution map. The deterministic (HARD) tier
itself lives in `machine-floor.md` — this file owns the JUDGMENT.

## Contents

- [The C1–C9 → six-family map](#the-c1c9--six-family-map)
- [F-L1 word](#f-l1--word) · [F-L2 sentence](#f-l2--sentence) · [F-L3 paragraph](#f-l3--paragraph)
- [F-L4 document logic](#f-l4--document-logic) · [F-register](#f-register) · [F-lifecycle](#f-lifecycle)
- [The terminology table](#the-terminology-table) · [Terminology normalization](#terminology-normalization)
- [Rewrite ledger](#rewrite-ledger)
- [Claim-calibration ledger](#claim-calibration-ledger) · [Audit-report failure ledger](#audit-report-failure-ledger)
- [Deck-level rules](#deck-level-rules) · [Document-level rules](#document-level-rules)
- [Running the audit on a harness](#running-the-audit-on-a-harness)
- [Sources](#sources)

## The C1–C9 → six-family map

The v2607.3 taxonomy (C1–C9, anchored to Orwell / Grice / Gopen & Swan / plain-language) is
PRESERVED as instances inside the six families. The family is the primary axis; the C-number is the
retained instance name (and the denylist regression handle). The tier says who catches it.

| old class | family · layer | tier | who catches it |
|---|---|---|---|
| C1 dying metaphors (`床`/`鎖`/`橋`…) | F-L1 word | MIX | house prh dict (known tokens) + VIBE (novel imagery) |
| C2 verbal false limbs (`返す`/`乗る`…) | F-L2 sentence | MIX | prh dict + VIBE (is control flow the content?) |
| C3 zombie nouns (`核`/`本体`/`基盤`…) | F-L1 word | VIBE | model — name the object or delete |
| C4 asserted emphasis (`ここが肝心`…) | F-L4 document logic | VIBE | model; textlint `no-ai-emphasis-patterns` catches the **bold** form (HARD) |
| C5 unearned abstraction (`一つに返す`…) | F-L4 document logic | VIBE | model — split into shared / differing inputs / outputs / phases |
| C6 tool-first titles | F-L4 document logic | VIBE | model — task in the topic position |
| C7 undefined coinage | F-register | MIX | prh dict (known) + VIBE (novel translation for an established term) |
| C8 AI slop | F-L1/F-L2/F-L4 | HARD | **textlint `preset-ai-writing` + slopless** — DELEGATED, not hand-maintained |
| C8 audit-report theater (`監査完了`/`PASS`…) | F-register | VIBE | model + the Stop hook (agent's own turn text) |
| C9 insider register export | F-register | HARD/VIBE | external prh dict (IDs, enums, `receipt:` = HARD) + VIBE (house dichotomies) |

**What changed at reforge #3:** C8's slop-token family is now off-the-shelf — `preset-ai-writing`
(no-ai-hype-expressions / no-ai-list-formatting / no-ai-emphasis-patterns / no-ai-colon-continuation)
plus English `slopless` cover it. Do NOT hand-maintain those token lists; delegate them
(`machine-floor.md`). The skill keeps only the audit-report-theater half (監査完了 / PASS-as-verdict),
which no preset covers and which the Stop hook polices.

## F-L1 — word

Layer: single words and short phrases. Tier: **HARD** for a textlint rule or a deterministic prh
entry (hype vocab, hedge words, IDs/enums); **MIX** for metaphor and coined-label tokens that are
also ordinary words (`橋`/`土台` — prh flags, the model confirms); **VIBE** for this project's novel
coinage (the grep is instance-overfit; the class judgment is not).

### C1 — dying metaphors (Orwell)

Structural / body-part metaphors standing in for the literal term. Map each to the field-standard
word; do not paraphrase one metaphor into another.

| metaphor | literal term | metaphor | literal term |
|---|---|---|---|
| `床`(floor) | lower bound | `土台`(foundation) | lower bound / basis |
| `鎖`(chain) | inequality / ordering | `山場`(climax) | the main step |
| `扇`(fan) | spread / variance | `持ち上げ`(lift) | apply / extend |
| `背骨`/`spine` | (drop; name the through-line) | `挟む`(sandwich) | bound above and below |
| `顔`(face) | side / use-case | `段差`(step) | difference / gap |
| `橋`(bridge) | connection / shared part | `アンカー`/`足場`/`ノブ` | required reference / assumption / variable |
| `畳む`(fold) | replace / supersede | `溶ける`(melt) | cease to be defensible |
| `囲う`(fence) | own exclusively | `殺す`(kill) | falsify / reject / terminate |

Recurs during revision — check tikz style names, variable names, diagram labels. For everyday words
(`顔`/`橋`/`土台`) prefer phrase-level review over a blind ban.

### C3 — zombie nouns & pretentious diction (Sword + Orwell)

Architecture nouns as rhetoric — abstract entities hiding a missing object: `核`, `中核`, `コア`,
`エンジン`, `基盤`, `パイプライン`, `層`, `本体`, `HUB`, `live`. Name the concrete function,
optimization problem, deliverable, or question. If deleting the word does not change the meaning,
delete it. (Gopen & Swan principle 5: articulate the action of every clause in its verb.)

### C7 undefined coinage (word half) and C8 AI hype vocabulary

C7: do not invent a native-language translation for an established term; keep the standard term or
give an operational description. Full C7 argument (with the terminology table) is under F-register —
coinage is a register decision. C8 hype vocab (革命的 / ゲームチェンジャー / 究極の / パラダイムシフト)
is HARD — `preset-ai-writing` `no-ai-hype-expressions`. Do not re-list it here.

## F-L2 — sentence

Layer: whole sentences. Tier: HARD for the surface metrics (delegated to textlint); VIBE for the
係り受け-hard checks with no off-the-shelf OSS.

**HARD (delegated to `preset-ja-technical-writing`):** sentence length, 読点 count, double
negatives, doubled 助詞, doubled 接続助詞 が, dropped-ら, weak phrases, redundant expressions, mixed
period. Do not re-implement — `machine-floor.md` owns the thresholds and the full rule list.

**C2 — verbal false limbs (Orwell), MIX:** processing/meta verbs that pad and dodge the relation —
`返す`(returning), `閉じる`(closing), `通す`(flowing through), `乗る`, `接続する`, `再走`, `一度に`.
Replace with explicit input/output or causal relation. Use only when the control flow IS the content.

**VIBE — no off-the-shelf OSS exists** (GitHub repo search returned zero; commercial 文賢 has a β
主述 check only). Judge these by reading:
- **一文一義** — one sentence, one proposition; textlint approximates only by character count.
- **主述近接 / 距離** — subject and predicate far apart, long insertions between them.
- **修飾語順** (本多勝一):節を先・句をあと; 長い修飾語ほど先. And テン at the modifier boundary / at
  reversed order.
- **逆茂木型** — modifiers piled before the subject so the sentence's meaning is unreadable until the
  end. Fix: put the modified word forward.

## F-L3 — paragraph

Layer: the paragraph as a logic unit (Kinoshita ch.4; 倉島 *論理が伝わる 世界標準の書く技術*, 7 rules;
Minto grouping). Tier: VIBE — no linter reaches paragraph logic; RedPen's SuccessiveSentence is
similarity-based redundancy, not topic structure.

- **Topic sentence present and leading.** Each paragraph opens with a sentence stating its one point;
  the rest is support or inter-paragraph linkage. Reading ONLY the topic sentences must reconstruct
  the argument (倉島 R3; titles-only test's paragraph analogue).
- **1-paragraph-1-topic.** A paragraph that shifts topic mid-way is split. No sentence contradicts
  its own topic sentence.
- **Known → unknown flow** (倉島 R7). Each sentence opens on information the reader already has (from
  the previous sentence's end) and adds the new — the Gopen & Swan topic/stress principle at
  paragraph scale.
- **総論 first** (倉島 R1). A section opens with an overview paragraph before its details.

## F-L4 — document logic

Layer: the whole document's claim discipline and the FLAGGING of its order (Kinoshita ch.7 owned
here; ch.2/3 document design is FLAGGED here, OWNED by `structuring-documents`). Tier: VIBE — no
off-the-shelf tool measures conclusion placement or fact/opinion separation. **FIX-LOCALITY line:**
a fix that rewrites words/one sentence stays here; a fix that MOVES sections, writes/repairs the
目標規定文, or reselects content (内容の精選) is a REBUILD → `structuring-documents`.

- **C4 asserted emphasis (Gopen & Swan stress position + Grice QUANTITY).** Emphasis lives in the
  stress position and in checkable information, never asserted: `ここが肝心`, `今日いちばん大事`,
  `合否を分ける`, `執念`, `ようやく`, `肝心`, `核心`, `正直な到達点`, `好例`. Delete, or state the
  factual reason the point changes a decision, bound, or comparison. (The **bold** form —
  `**非常に**重要` — is HARD via `no-ai-emphasis-patterns`.)
- **C5 unearned abstraction (Grice QUALITY).** A claimed unity asserted before it is earned:
  `一つに返す`, `一つの仕様に乗る`, `一本に通す`, `そのまま接続(できる)`. Split into shared formulation
  / differing inputs / differing outputs / differing phases.
- **C6 topic-position violations / tool-first titles (Gopen & Swan principle 3).** The tool occupies
  the topic position that belongs to the task: `製造前設計: PDK・GDSFactory/SAX`, `QASM に挿す`. State
  the task or outcome first; the toolchain is a subtitle or caption. Same for proposal/submission
  headings and opening sentences.
- **Fact/opinion separation — スリカエ (Kinoshita ch.7, the canon's most-important rule).** Fact
  (objectively checkable) and opinion (inference, hypothesis, judgment) must not be interchanged. The
  named failure: a sentence written as opinion in one line, then treated as established fact in the
  next, so the logic silently rests on the unproven. State facts as facts, opinions with their
  subject ("we infer …"). This is where proposals and rebuttals fail hardest.
- **Conclusion-first / BLUF — FLAG only (重点先行 at document scale, Kinoshita ch.3, OWNED by
  `structuring-documents`).** Flag a document whose thesis is only assembled in the last paragraph,
  or an abstract that opens with internal workflow vocabulary instead of task+claim. The paragraph-
  scale instance (a topic sentence at the paragraph head) IS owned here as an L3 rewrite; the
  document-scale fix (reorder sections, rewrite the abstract lead) MOVES information → hand off to
  `structuring-documents`.
- **目標規定文 — FLAG only (Kinoshita ch.2, OWNED by `structuring-documents`).** Flag a document with
  no single governing thesis, or one that drifts from the thesis it stated. Writing or repairing the
  目標規定文 and reselecting content against it (内容の精選) is a REBUILD → `structuring-documents`.

## F-register

Layer: the for-whom axis, crossing all layers. Tier: MIX where a denylist exists (greppable via the
house prh dict), VIBE otherwise. This is the skill's differentiated core.

### C9 — insider register export (declared novel; cousin of C7 with the definition PRESENT)

Internal project grammar shipped to an external reader: ledger/provenance IDs (`R2607_016 §7`),
`receipt:`, `gated`, verdict enums (`IMPLEMENTATION_GATED`, `ADAPTIVE_RECOVERS`, `CELL_DEGENERATE`),
house dichotomies (`agnostic`/`aware`), internal cell taxonomies. Every one IS defined — in the
project — so C7's "undefined" never fires; the violation is that the DECLARED READER holds none of it.

- **C7 polices missing definitions** (nobody has them);
- **C9 polices definitions the reader was never given** (the project has them).

| insider form | reader-facing form |
|---|---|
| `receipt: R2607_016 §7` | appendix reference or the reader's citation format — or drop |
| `R2607_008 gated`, `field 未検証（… gated）` | 「実機検証は未実施」 stated once, in prose |
| `agnostic` / `aware`（house dichotomy） | the plain contrast: 「業界標準の設計」/「設計空間を踏まえた再設計」 |
| verdict enums (`CELL_DEGENERATE`, `IMPLEMENTATION_GATED` …) | the finding in one sentence: 「この構成では設計変更の余地がない」 |
| `PASS` / `certified`（as insider verdicts） | what was shown, for whom it holds, what remains |
| internal cell/coordinate taxonomy as headers | the reader's question each cell answers |

**Greppable subset → the external prh dict** (`assets/prh-external.yml`, loaded by
`textlintrc-external.json`). Any `[A-Z]{1,3}[0-9]{4}_[0-9]{2,3}` ID, any `[A-Z]{3,}_[A-Z_]{3,}`
verdict enum, `receipt:`, and `PASS`-as-verdict fire deterministically (proven on QOED
`RESEARCH_STATE.md`) — these are HARD. House dichotomies are NOT greppable — VIBE only.

### C8 audit-report theater (house half)

The lint report reproducing the failure it polices: `監査完了`, `PASS`/`GREEN`, `通過`,
`核は stable`, `私の起因でない`, `正直な到達点`. Rewrite as bounded evidence — what artifact was
checked, which rule ran, what it cannot prove, what remains uninspected. The Stop hook
`detect-audit-theater.ts` co-enforces on the agent's own turn text.

### Register consistency

dearu/desumasu mixing is HARD (`no-mix-dearu-desumasu`); 心情的要素 in a technical register and
non-specialist vocabulary (3MT: avoid unnecessary jargon, gloss key terms) are VIBE.

## F-lifecycle

Layer: the document over time (declared novel — no canon, no tool). Tier: VIBE. Source: the QOED
71-finding audit, where append-only self-correction was the second-largest failure mode.

- **Retracted claim left standing.** A claim retracted or superseded in the body but kept in a
  summary table cell, a section heading, or an abstract. QOED `R2606_081`: the body concludes
  "PO11 = 唯一ギャップ was wrong", the summary table and the `## 唯一のギャップ PO11` heading keep the
  retracted framing — a reader who reads only the table inherits the dead claim. **Fix: the
  retraction must reach every surface** (table, heading, abstract), or the claim is not retracted.
- **Self line-number cross-reference** (`L164 が確定版`, `general-theory L499`). Line numbers are
  volatile anchors — an edit shifts them and the "確定版" pointer rots. Reference by section
  heading/anchor, and mark the confirmed version at its own head.
- **Tag-system drift across files.** A confidence-tag or verdict vocabulary that means different
  things in different files ([C] = "unsolved" in one, "provable" in another). One tag system, one
  home for its legend.
- **Undated volatile numbers.** "本セッション再走" / "Opus 再走" as the provenance of a persisted
  number — unresolvable outside the writing session. Stamp with a date + script + seed.

## The terminology table

C7's arguing home. Coinage itself is never the violation; *implicit* coinage is. When a document
earns three or more necessary-but-not-standard terms it MUST carry an explicit table:

| column | content |
|---|---|
| term | the exact surface form, one per concept |
| definition | one operational line a reader can apply without the author present |
| nearest standard term + why it fails | the closest established term and the concrete reason it does not carry the intended meaning |

Placement: front matter or a named appendix — met at or before first use. **Budget bound:** the table
discloses necessary terms; it does not license coinage. The define-at-first-use count is capped by
the term budget (AUDIENCE check, SKILL.md — the single home of the number). A document that "needs"
ten tabled terms is mis-structured, not under-tabled. Once the table exists, review checks USAGE against it — drift between table and text is
a violation of the same class as undefined coinage.

## Terminology normalization

One surface form per concept, the field's form if one exists: `テープアウト` not `tape-out`; pick one
of `pre-fab`/`prefab`/`manufacturing-phase design`; do not alternate `library`/`engine`/`core` for
the same artifact. The machine impl is `prh` (JA) / Vale `substitution` + Vocab (EN) —
`machine-floor.md`. When the user has chosen a surface form, follow it.

## Rewrite ledger

| # | Bad | Better | Family · why |
|---|---|---|---|
| 1 | `既存ツールは一つに返さない` | `既存ツールは測定設計・本数設計・誤差限界評価を別々に扱う` | F-L4 C5 — name the missing decomposition |
| 2 | `測定を変えると分布が変わる` | `測定選択は、同じ ρ(θ) からどの古典統計モデルを実装するかの選択である` | F-L4 — make agency explicit |
| 3 | `製造前設計: PDK・GDSFactory/SAX` | `製造前設計では、候補設計を較正しやすさ込みで比較する` | F-L4 C6 — task first, tools in subtitle |
| 4 | `pre-fab も post-fab も一つの仕様に乗る` | `pre-fab と post-fab は入力重みが異なるが、同じ最適化問題として記述できる` | F-L4 C5 — scoped commonality |
| 5 | `ここが肝心です` | `この制約が測定本数と達成誤差の下限を決める` | F-L4 C4 — emphasis → reason |
| 6 | `共通の床を提供する` | `共通の下界を与える` | F-L1 C1 — metaphor → literal term |
| 7 | `業界の基盤になる（ただし市場はまだ無い）` | `このギャップを最初に埋める実装である` | claim-theater → calibrated |
| 8 | `banned PASS なので監査完了` | `denylist scan found no listed terms in R2607_008; claim consistency was not checked` | C8 → bounded evidence |
| 9 | `aware：adaptive（SW のみ）0.4570（61.6%）… receipt: R2607_016 §7` | `測定順序をソフトウェアで適応化するだけで、装置を変えず改善余地の約6割を回収できる（導出は付録A）` | F-register C9 — reader's vocabulary |
| 10 | (table cell keeps `唯一ギャップ` after the body retracts it) | update the cell, heading, and abstract to the corrected conclusion | F-lifecycle — retraction reaches every surface |
| 11 | `数学的本体＝decision fan＋3 写像制限＋… [C]（calculus §10）` | 平文2文で「何を設計する理論か・何が証明済みで何が予想か」 | F-register — curse-of-knowledge thesis |

## Claim-calibration ledger

| failure | symptom | fix |
|---|---|---|
| overclaim | platform / hero / flywheel / "first ever" without proof | match the evidence; name the smaller true claim |
| underclaim | the real contribution buried under caveats | lead with it; demote caveats to gray |
| hedge-after-hype | big noun, then a canceling parenthetical | one calibrated claim; limit stated first, inside it |
| pendulum | evaluation flips weak→great→weak across drafts | revise only on newly-read evidence; cite it |
| stakes-without-claim | "this decides everything" with no proposition | state what changes (decision/bound/comparison) |
| PASS theater | gate result treated as total proof | name the command, scope, residual unchecked claims |
| unverified factual verdict | prose audit declares a contradiction without source lines | cite both lines or mark "possible only" |
| repair spiral | repeated local patches introduce new contradictions | stop; rewrite the smallest coherent block |

## Audit-report failure ledger

Use when the reviewed text is an agent's own prose audit, status update, or repair report.

| failure | symptom | required rewrite |
|---|---|---|
| self-justifying audit | long story about diligence, rounds, "正直な到達点" | five slots, then stop |
| gate overreach | `PASS`/`GREEN` presented as correctness | "textlint passed over files Y; it does not check Z" |
| blame displacement | "my cause / not my cause" | scope statement: fixed, not touched, or out of scope |
| metaphor repair still metaphorical | replacement column contains `anchor`/`scaffold`/`moat`/`melt` | replace with the literal domain relation |
| factual repair from wording only | "found factual contradiction" without citations | cite both source lines or downgrade to "possible" |
| convergence claim | "stable"/"done"/"core passed" after failed edits | report exact remaining risk; stop claiming convergence |
| register leak (C9) | audit grammar (receipts, verdict enums, bounded-PASS) inside the deliverable | translate to the reader's vocabulary; provenance to appendix |

## Deck-level rules

- A divider with no message stays a divider — do not promote it into a fake claim.
- A section title tells the audience what changes in their understanding at that point.
- If SCQ/A structure is used, section boundaries match claim boundaries.
- On-board the task before the toolchain — say what `PDK`/`GDSFactory`/`QASM` are DOING in the
  argument, not just that they exist.

## Document-level rules

- Abstracts and executive summaries open with the task and claim, not internal workflow vocabulary.
- Cover letters, research statements, application essays avoid writer-hype phrasing.
- Rebuttals answer the objection in the first sentence, then give evidence.
- Submission-document headers survive the titles-only test.
- READMEs: the front door states scope in 2–3 sentences of the reader's vocabulary; internal record
  IDs go in a footnote, never as the load-bearing scope statement (QOED README failure).
- **Notation hygiene.** One symbol per object; spell out each acronym + gloss at first use, then
  abbreviate; never bare-emit notation the reader cannot pause on (worst in a spoken script).
- **Disclosure of names.** Never print an unconfirmed proper name or a claimed *current* collaboration;
  a factual PAST affiliation is fine — a claimed present partnership is a hallucination risk.

## Skill glossary (house tokens — moved from SKILL.md at reforge #4)

| house term | status | definition |
|---|---|---|
| HARD / MIX / VIBE | derived — JakobThumm/proofreading | deterministic-delegable / pattern+judgment / reading-comprehension |
| machine floor | novel — declared | the delegated deterministic tier (`bunx textlint` JA); the skill configures, never re-codes it |
| the four layers | anchored — Kinoshita, *理科系の作文技術* (1981) | word / sentence / paragraph / structure |
| register (axis) | anchored — sociolinguistic register | which terms/claims are admissible for the DECLARED reader |
| lifecycle (axis) | novel — declared | document-over-time integrity: retracted claims left standing, line-number refs, undated numbers |
| calibration (axis) | anchored — Grice QUANTITY/QUALITY; Hyland hedges/boosters | claim-evidence fit: over/underclaim, limits-in-claim, no truth verdicts from prose alone |
| insider register export | novel — declared (was C9) | internal grammar (IDs, receipts, verdict tokens, dichotomies) shipped to a reader never given the definitions |
| audience line | novel — declared | reader / holds / register / prose-language declaration required before drafting or grading |
| term budget | novel — declared | ≤3 define-at-first-use terms per external page-equivalent (number's runtime home: SKILL.md gate 0) |
| スリカエ | anchored — Kinoshita ch.7 | opinion written, then treated as fact — the canon's worst failure |
| bounded-PASS | novel — declared | PASS/GREEN legal only with a same-line what-was-checked / what-remains clause |
| audit-report theater | novel — declared; echoes Schneier | the lint report reproducing the failure it polices; Stop hook `detect-audit-theater.ts` |
| packaging | derived — house umbrella over Orwell's vices | prose about integration/convenience/importance/imagery instead of the object |
| repair spiral | novel — declared | 2 failed patches or 1 new contradiction ⇒ rewrite the smallest coherent block |
| worker-side duty | novel — declared | as a spawned lens: read-only, five-slot findings, no verdict language |

## Running the audit on a harness

Operating guidance from a frontier model (Fable 5 / Opus 4.8, 2026-07) to whatever model runs this
later.

**Scale calibration — no fan-out theater.** A single document, deck, abstract, or memo is a solo
job: run `bunx textlint`, read the rendered text yourself. Spawn per-file **read-only flaggers** only
for a multi-file package, ~50+ slides, or when this skill is the prose lens inside another skill's
audit fleet. **Never spawn an agent to run the lint** — it is a deterministic script; script-over-
agent is precedence.

| Stage | Mode | Why |
|---|---|---|
| machine floor (`bunx textlint` / `Vale`) | **SCRIPT** | deterministic; agents add noise, not coverage |
| per-file VIBE flagging | **FAN-OUT, read-only** | family judgment is file-local |
| terminology inventory | **FAN-OUT collect → BARRIER → SOLO** | variant forms collected per file; canonical form chosen once over all |
| claim calibration, rewrite, report signing | **SOLO** | register consistency + the repair-spiral stop rule demand one voice |

**The flagger contract** — every spawn carries five elements: (1) exact input file paths; (2) the
bar — the agent READS this skill's SKILL.md, no paraphrased denylist in the prompt (paraphrase
drifts AND primes); (3) the output schema — the five-slot grammar (target / family+tier / cited
evidence / replacement / unchecked risk) as structured findings, not prose; (4) a read-only
declaration; (5) "your final message is the return value".

**Epistemics and the trust boundary.**
- **Name the families, never the sins.** Flagger prompts carry family and tier NAMES, never example
  bad lines from the document under audit — a primed flagger returns the primed lines whether or not
  they fail (confirmation at machine speed).
- A finding without a quoted line is quarantined, not "probably fine".
- **No truth verdicts from agents.** A factual flag stays 内容未確認 unless both source lines are quoted.
- N agents flagging one line is one observation, not N-fold confidence.
- The orchestrator re-reads every flagged line in place before rewriting — the editor signs.
- An agent return asserting `PASS`/`監査完了`/`GREEN` as its own verdict is an audit-theater violation
  — bounce it. Quoted-evidence fields legitimately CONTAIN those strings as the things flagged.
- Flaggers return wording / claim / register / lifecycle / document-logic (L3/L4) findings — those
  are THIS skill's own. Slide/figure findings belong to `designing-presentations`; a finding whose
  fix is a REORGANIZATION (section moves, MECE partition, dedup) is handed to `structuring-documents`.

**Worker-side duty.** When THIS skill runs as the spawned auditor inside another workflow (the
`systematizing-knowledge` orchestration map fans out a read-only prose audit at its write stage), the
bounded-report discipline IS its contract: read-only, five-slot findings, an explicit residual-risk
clause, no verdict language.

**No harness — same order, serially:** floor script → per-section flagging → terminology sweep →
claim calibration → coherent-block rewrite → bounded report.

## Sources

*Verified* = fetched and quoted in a reforge harvest; *named* = cited by name only.

- Orwell, "Politics and the English Language" (1946) — verified.
  <https://www.orwellfoundation.com/the-orwell-foundation/orwell/essays-and-other-works/politics-and-the-english-language/>
- Grice, "Logic and Conversation" (1975), *Syntax and Semantics 3* — verified (QUANTITY/QUALITY).
- Sword, "Zombie Nouns," NYT *Opinionator*, 2012 — verified.
- Gopen & Swan, "The Science of Scientific Writing," *American Scientist* (1990) — verified
  (topic/stress positions; principle 5). No off-the-shelf mechanization of the reader-expectation
  principle exists (survey 2026-07). <https://www.usenix.org/sites/default/files/gopen_and_swan_science_of_scientific_writing.pdf>
- Kinoshita 是雄, *理科系の作文技術* (中公新書 624, 1981) — author-confirmed via two lecture digests
  (佐賀大 <https://www.cs.is.saga-u.ac.jp/lecture/techWriting/techWriting.pdf>; 群馬大
  <https://mems.mst.st.gunma-u.ac.jp/lecture/wordsmanship_suzuki.pdf>). Four layers; ch.7 fact/opinion
  スリカエ; ch.4 topic sentence; ch.3 重点先行; ch.2 目標規定文. **Needs-verification:** whether the book
  bans 起承転結 outright (secondary sources diverge) — shipped as a slot, not asserted.
- 本多勝一, *日本語の作文技術* — named; modifier-order four principles + テン two principles
  (<https://www.math.nagoya-u.ac.jp/~shinichiroh/2018/02/13/japanese-punctuation.html>).
- 倉島保美, *論理が伝わる 世界標準の書く技術* — named (paragraph 7 rules); 結城浩 *数学文章作法* — named;
  Minto, *The Pyramid Principle* — named. Sub-rules **needs-verification** (原著本文 not fetched).
- Plain language: digital.gov "Avoid jargon"; ISO 24495-1:2023 — verified/named. No automatic
  conformance checker found (survey 2026-07).
- Kobak et al., "excess vocabulary," *Science Advances* 11(27) 2025 — verified
  <https://arxiv.org/abs/2406.07016>; Liang et al., "Monitoring AI-Modified Content at Scale," 2024 —
  verified <https://arxiv.org/abs/2403.07183>; "AI slop" (M-W / ADS 2025 WotY) — verified; Wikipedia
  "Signs of AI writing" — verified <https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing>.
- JakobThumm/proofreading (HARD/MIX/VIBE tier; MIT Claude skill) — verified
  <https://github.com/JakobThumm/proofreading>. 3MT judging criteria (non-specialist language) —
  verified <https://3mt.wsu.edu/judgingcriteria/>.
- Hyland, hedges and boosters (1998); Harnad, symbol grounding (1990); Schneier, security theater
  (2003) — named. PICO / Minto governing thought — named (cousins of the four-slot test).
- Tooling (machine floor): textlint / `preset-ja-technical-writing` / `@textlint-ja/preset-ai-writing`
  / `prh`; Vale + Google/Microsoft + `proselint`; `slopless` — all with URLs in `machine-floor.md`.
