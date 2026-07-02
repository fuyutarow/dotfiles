# Patterns

## Contents

- [Fast lint](#fast-lint)
- [Pattern families](#pattern-families)
- [Rewrite ledger](#rewrite-ledger)
- [Claim-calibration ledger](#claim-calibration-ledger)
- [Audit-report failure ledger](#audit-report-failure-ledger)
- [Deck-level rules](#deck-level-rules)
- [Document-level rules](#document-level-rules)
- [Denylist as a machine gate](#denylist-as-a-machine-gate)
- [Running the audit on a harness](#running-the-audit-on-a-harness--scripts-first-agents-at-scale)
- [Terminology normalization](#terminology-normalization)

## Fast lint

Run these checks on every title, header, summary sentence, or script line:

1. Can I point to the subject?
2. Can I name the comparison class?
3. Can I tell whether the sentence is about the object, or about the convenience of packaging it?
4. If I delete the emphasis phrase, does any meaning disappear?
5. If the title or paragraph lead mentions only tools, modules, or infrastructure, where is the
   audience message?
6. If this is an audit report, does each PASS/GREEN/verified claim name exactly what was checked?
7. Did the report introduce a factual verdict without citing the source lines or data it inspected?

If two or more answers are "no", rewrite from scratch instead of editing locally.

## Pattern families

### Processing/meta language

These words are common in engineering conversation but weak in audience-facing prose:

- `返す`
- `閉じる`
- `通す`
- `乗る`
- `接続する`
- `再走`
- `一度に`

Use them only when the control flow is itself the content. Otherwise, rewrite in terms of inputs,
outputs, and relations.

### Architecture-as-rhetoric

These words often hide a missing object:

- `中核`
- `コア`
- `エンジン`
- `基盤`
- `パイプライン`
- `層`
- `核`
- `本体`
- `HUB`
- `live`

If removing the word does not change the technical meaning, delete it.

### Writer self-emphasis

These phrases try to force attention instead of earning it:

- `ここが肝心`
- `今日いちばん大事`
- `合否を分ける`
- `この実務の執念から`
- `正直な到達点`
- `これは重要な pattern`
- `好例`

Replace them with the reason the statement changes a decision, bound, or comparison.

### False unity

These phrases collapse distinctions too early:

- `一つに返す`
- `一つの仕様に乗る`
- `一本に通す`
- `そのまま接続できる`

Rewrite by splitting:

- shared formulation
- differing inputs
- differing outputs
- differing deployment phases

### Tool-first framing

Tool names are useful evidence, not a thesis. Avoid titles like:

- `製造前設計: PDK・GDSFactory/SAX`
- `QASM に挿す`

Prefer:

- task or decision first
- toolchain second
- deployment phase explicit

The same rule applies to headings in proposals and submission documents. A section header should
state the question, claim, or deliverable, not merely the implementation vocabulary.

### Metaphor and decorative imagery

A common LLM-style failure mode: a structural or body-part metaphor replaces the literal term. Map each
to the standard word in the field instead of paraphrasing it with another image.

| metaphor | literal term |
|---|---|
| `床` (floor) | lower bound |
| `鎖` (chain) | inequality / ordering |
| `扇` (fan) | spread / variance |
| `背骨` / `spine` | (drop; name the through-line) |
| `顔` (face) | side / use-case |
| `橋` (bridge) | connection / shared part |
| `土台` (foundation) | lower bound / basis |
| `山場` (climax) | the main step |
| `持ち上げ` (lift) | apply / extend |
| `挟む` (sandwich) | bound from above and below |
| `段差` (step) | difference / gap |
| `アンカー` (anchor) | current source / required reference / fixed assumption |
| `足場` (scaffold) | preliminary assumption / validation step |
| `ノブ` (knob) | optimization variable / configuration parameter |
| `畳む` (fold) | replace / supersede / remove |
| `溶ける` (melt) | fail to remain defensible / cease to be durable |
| `囲う` (fence) | own exclusively / restrict access |
| `殺す` (kill) | falsify / reject / terminate, unless "kill experiment" is the chosen term |

This family often recurs during revision. Check tikz style names, variable names, and diagram
labels (`face`, `bridge`) too. For everyday words such as `顔`, `橋`, or `土台`, prefer phrase-level
review or a soft lint over a blind hard-ban.

### Coined and fabricated translations

Do not invent a native-language translation for an established term. Keep the established term, or
give an operational description.

- Bad: a fabricated word for "most informative bound".
- Better: keep "most informative (CR) bound", or "the minimum cost achievable by individual measurements".

### Claim-theater and mis-calibration

A claim that is inflated and then walked back is usually a calibration failure:

- `業界の基盤になる` + `（ただし市場はまだ無い）` — grandiose noun offset by a deflating caveat.
- `決定的に違う` / `今日の合否を分ける一文` — stakes-language with no proposition.

Rewrite to the single claim the evidence supports, with the limit stated inside the claim and set in
gray, not bolted on as a counter-weight.

### Audit-report theater

The audit report can reproduce the failure it is supposed to catch. These phrases convert a repair
into a self-defense memo:

- `監査完了`
- `PASS` / `GREEN`
- `通過`
- `核は stable`
- `私の起因でない`
- `好例`
- `正直な到達点`

Rewrite as bounded evidence:

- what artifact was checked
- which rule or command was applied
- what the check can and cannot prove
- what remains uninspected

Bad: `banned PASS なので監査完了`

Better: `denylist scan found no listed strings in R2607_008; sentence clarity and factual consistency were not checked by that scan`

Bad: `R2607_007 は私の起因でない`

Better: `R2607_007 still fails the prose gate; this change either fixes it or excludes it explicitly from scope`

## Rewrite ledger

### Example 1

- Bad: `既存ツールは一つに返さない`
- Better: `既存ツールは測定設計・本数設計・誤差限界評価を別々に扱う`

Why: the rewrite names the missing decomposition instead of talking about packaging.

### Example 2

- Bad: `測定を変えると分布が変わる`
- Better: `測定選択は、同じ rho(theta) からどの古典統計モデルを実装するかの選択である`

Why: the rewrite makes agency explicit. The measurement is not a passive perturbation; it defines
the induced model.

### Example 3

- Bad: `製造前設計: PDK・GDSFactory/SAX`
- Better: `製造前設計では、候補設計を較正しやすさ込みで比較する`

Why: the rewrite leads with the job to be done. Tool names can appear in the subtitle, caption, or
speaker notes.

### Example 4

- Bad: `pre-fab も post-fab も一つの仕様に乗る`
- Better: `pre-fab と post-fab は入力重みが異なるが、同じ最適化問題として記述できる`

Why: the rewrite preserves the distinction while still stating the shared formulation.

### Example 5

- Bad: `ここが肝心です`
- Better: `この制約が測定本数と達成誤差の下限を決める`

Why: the rewrite replaces writer emphasis with a causal statement.

### Example 6

- Bad: `共通の床を提供する`
- Better: `共通の下界を与える`

Why: the rewrite drops the floor metaphor for the field-standard term.

### Example 7

- Bad: `業界の基盤になる（ただし市場はまだ無い）`
- Better: `このギャップを最初に埋める実装である`

Why: the rewrite replaces a grandiose noun + deflating caveat (claim-theater) with the one claim the
evidence supports.

## Claim-calibration ledger

Audit titles, abstracts, and rebuttals for the calibration failure, not only the wording failure.

| failure | symptom | fix |
|---|---|---|
| overclaim | platform / hero / flywheel / "first ever" without proof | match the evidence; name the exact, smaller true claim |
| underclaim | the real contribution buried under three caveats | lead with the contribution; demote caveats to gray secondary |
| hedge-after-hype | big noun, then a canceling parenthetical | one calibrated claim; limit stated first, inside it |
| pendulum | evaluation flips weak→great→weak across drafts | only revise on newly-read evidence; cite it; do not move on mood |
| stakes-without-claim | "this decides everything" with no proposition | state what changes (a decision, a bound, a comparison) |
| PASS theater | gate result treated as total proof | name the command, scope, and residual unchecked claims |
| ownership deflection | "not my cause" instead of a scope decision | fix it or state it is outside scope without self-excuse |
| unverified factual verdict | prose audit declares a contradiction without source lines | cite both lines/data or mark as possible only |
| repair spiral | repeated local patches introduce new contradictions | stop patching; rewrite the smallest coherent block from source |

## Audit-report failure ledger

Use this when the output being reviewed is an agent's own prose audit, status update, or repair
report.

| failure | symptom | required rewrite |
|---|---|---|
| self-justifying audit | long story about diligence, rounds, or "正直な到達点" | target / violation / evidence / replacement, then stop |
| gate overreach | `PASS` or `GREEN` presented as correctness | "command X passed over files Y; it does not check Z" |
| blame displacement | "my cause / not my cause" | scope statement: fixed, not touched, or outside requested task |
| metaphor repair table still metaphorical | replacement column contains `anchor`, `scaffold`, `moat`, `melt`, `fence`, `kill` | replace with literal domain relation |
| factual repair from wording only | "prose audit found factual contradiction" without citations | cite both source lines or downgrade to "possible" |
| convergence claim | "stable", "done", "asymptotic", "core passed" after repeated failed edits | report exact remaining risk and stop claiming convergence |

## Deck-level rules

- A divider with no message should remain a divider. Do not promote it into a fake claim.
- A section title should tell the audience what changes in their understanding at that point.
- If SCQ/A structure is used, section boundaries must match claim boundaries. Do not let section
  titles blur `C` and `Q`, or merge a benchmark section with an application section.
- When broad readership matters, on-board the task before the toolchain. Say what `PDK`,
  `GDSFactory`, or `QASM` are doing in the argument, not just that they exist.

## Document-level rules

- Abstracts and executive summaries should open with the task and claim, not with internal
  workflow vocabulary.
- Cover letters, research statements, and application essays should avoid writer-hype phrasing for
  the same reason slide scripts should avoid stage-emphasis phrasing.
- Rebuttals and review responses should answer the objection in the first sentence, then provide
  the evidence or clarification.
- Section headers in submission documents should survive the same titles-only test as slides:
  reading the headers alone should reconstruct the logic.

## Denylist as a machine gate

When the rendered audience-facing text is greppable, turn these families into a check so they cannot
regress (see the `operating-the-harness` skill for wiring). A portable starting set:

```
# audience-facing prose denylist (tune per project; strip comments before matching)
返[すさ]            # processing verb — but exclude 繰り返す/裏返す/折り返す via lookbehind
一行で閉じ          # false unity
そのまま.{0,3}接続   # false unity
(?<!見)(?<!人)通[すし] # processing verb — exclude 見通し/人通り
に乗[るっ]           # rhetoric
主因                # effect-word meta
一度に|一度の実行     # convenience copy
再走                # insider verb
核|本体|中核|エンジン|\bcore\b|\bengine\b|\bHUB\b|\blive\b   # architecture-as-rhetoric
tape-out            # normalize to テープアウト
床|鎖|扇|背骨|山場|持ち上げ|挟[んみ]|段差   # metaphor candidates; audit 顔/橋/土台 in context
アンカー|足場|ノブ|畳[むん]|溶け|囲[うわい]|殺[すし]   # metaphor candidates; allow chosen technical terms with context
PASS|GREEN|監査完了|好例|私の起因でない   # audit-report theater; prefer bounded evidence
```

Rules that make a gate real, not decorative:

- **Scope to rendered audience-facing files** (the built deck source, the proposal `.md`/`.tex`,
  the script). Exclude design docs, the denylist ledger itself, and orphan drafts — they contain the
  banned words legitimately as the things-being-banned.
- **Strip comments** before matching so `% ...` notes do not trip it.
- **Guard bare common verbs** with lookbehinds or collocations (`返す` matches `繰り返す`;
  `通す` matches `見通し`; `床`/`顔`/`橋`/`土台` are ordinary words — match the phrase, or keep them
  human-reviewed rather than hard-gated).
- **Wire the check into the aggregate command you actually run** (the CI target, the pre-commit). A
  rule that lives in a script nobody invokes is not enforced.
- **Prove it fires** by injecting a known-bad line, watching it fail, and reverting.
- **The gate is necessary, not sufficient** — overflow, mid-word title wraps, and crushed figures
  only appear on the rendered page. Render and read every page.
- **A green gate is not a prose verdict.** It proves only that the configured patterns did not match
  the scoped text. Report residual checks separately: clarity, factual consistency, rendering, and
  audience fit.

Use a hard gate only for low-ambiguity phrases. Prefer soft lint or human review for ambiguous
everyday words and for claim-calibration judgments.

## Running the audit on a harness — scripts first, agents at scale

Operating guidance from a frontier model (Fable 5, 2026-07) to whatever model runs this audit later.

**Scale calibration — no fan-out theater.** A single document, deck, abstract, or memo is a solo
job: run the gate script and read the rendered text yourself; agents cost more than they return.
Spawn per-file **read-only flaggers** only for a multi-file package, ~30+ sections / 50+ slides, or
when this skill is invoked as the prose lens inside another skill's audit fleet. **Never spawn an
agent to run the regex** — the gate (previous section) is a deterministic script; an agent doing
grep is slower and non-deterministic. Script-over-agent is precedence: the gate scan runs first at
every scale.

| Stage | Mode | Why |
|---|---|---|
| gate scan | **SCRIPT** | deterministic; agents add noise, not coverage |
| per-file flagging | **FAN-OUT, read-only** | denylist / four-slot judgment is file-local |
| terminology inventory | **FAN-OUT collect → BARRIER → SOLO** | variant surface forms are collected per file; the canonical form is chosen once over all of them (Terminology normalization) |
| claim calibration, rewrite, report signing | **SOLO** | register consistency (SKILL.md Beyond words) and the stop rule (Non-negotiables: rewrite the smallest coherent block) demand one voice over the whole text |

**The flagger contract** — every spawn carries five elements:

1. **Exact input files** — the absolute paths this flagger reads, nothing else.
2. **The bar** — the agent READS this skill's SKILL.md itself; do not paraphrase the denylist or
   the four-slot test into the prompt (paraphrase drifts — and primes, see below).
3. **The output schema** — the report grammar SKILL.md defines (target / violation / evidence /
   replacement, unverified marking), returned as structured findings, not prose:
   ```json
   {"findings":[{"target":"file + line + quoted text","violation":"named denylist category or empty slot",
     "evidence":"the quoted line","replacement":"...","unverified":false}]}
   ```
4. **Read-only declaration** — a flagger never edits the document under audit; fixes belong to the
   orchestrator's solo rewrite stage.
5. **"Your final message is the return value"** — findings data, not a narrated audit story.

**Epistemics and the trust boundary.**

- **Name the slots, never the sins.** Flagger prompts carry category and slot NAMES, never example
  bad lines from the document under audit — a denylist-primed flagger returns the primed lines
  whether or not they fail (confirmation at machine speed).
- A finding without a quoted line is quarantined, not "probably fine".
- **No truth verdicts from agents.** A factual flag stays 内容未確認 unless both source lines are
  quoted (Claim calibration).
- N agents flagging the same line is one observation, not N-fold confidence.
- The orchestrator re-reads every flagged line in place before rewriting — the editor signs.
- An agent return **asserting** `PASS` / `監査完了` / `GREEN` as its own verdict is a Denylist 8
  violation — bounce it. Quoted-evidence fields legitimately CONTAIN those strings as the
  things-being-flagged (same exemption the gate-scoping rule gives the denylist ledger itself).
- Flaggers return wording and claim findings only; structure, ordering, and figure findings belong
  to `designing-presentations`, not to this fleet.

**Worker-side duty.** When THIS skill runs as the spawned auditor inside another workflow — the
systematizing-knowledge orchestration map fans out a read-only prose audit at its write stage, and
this skill is that lens — the bounded-report discipline IS its contract: read-only, structured
findings in the schema above, an explicit residual-risk clause, no verdict language.

| Anti-pattern | Fix |
|---|---|
| **Regex-by-agent** — an agent spawned to run the denylist scan | the gate is a script; agents are for judgment flagging only |
| **Denylist-primed over-flag** — the document's bad lines pasted into flagger prompts | prompts name categories; the agent finds, the prompt does not feed |
| **Sharded rewrite** — per-section fixer agents | register drift + terminology forks + the banned repair spiral; the rewrite is solo, smallest coherent block |

**No harness — degrade to the same order, serially:** gate script → per-section flagging pass →
terminology sweep → claim calibration → coherent-block rewrite → bounded report. Wiring the gate
into hooks/CI stays with `operating-the-harness`.

## Terminology normalization

Normalize terminology across the deck, memo, or script:

- `テープアウト`, not `tape-out`
- choose one of `pre-fab` / `prefab` / `manufacturing-phase design` and use it consistently
- choose one of `post-fab calibration` / `device-specific calibration` and use it consistently
- do not alternate between `library`, `engine`, and `core` for the same artifact

When the user has already chosen a surface form, follow it.
