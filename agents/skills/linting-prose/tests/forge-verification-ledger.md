# Forge verification ledger — this skill's F3 artifact

The adversarial-verification findings ledger the forging-skills gate F3 demands. Append on any
future reforge; never overwrite.

## CURRENT STATE (read this first — everything below is append-only HISTORY; dead decisions live there)

**Invariants (live):**
- Floor is detect-only via `scripts/lint-floor.ts` (`--fix` refused); prh replacements are guidance text.
- 4 JA profiles (base ですます / research である / external +C9 / strict codemix opt-in); profile choice is load-bearing.
- Admissibility is READER-relative; internal register waives comprehension, never hygiene (verb calques, exact-equivalent loan nouns banned in any register).
- Sourcing ladder ADOPT > CONFIGURE > AUTHOR — and ADOPT is reader-gated too (an established dictionary fails if its implied reader ≠ the declared reader).
- Fire/no-fire desk-check set lives in `tests/triggers.md`; re-run on any description edit.
- L4's label is **document logic** (renamed from "structure" — it collided with the sibling skill name). **FIX-LOCALITY cut** vs `structuring-documents` (v6, supersedes the MODE cut): rewrite-words-in-place = HERE; move-information-across-the-document = there. This skill owns 木下 **ch.4–8** (paragraph→word) + 事実と意見/スリカエ (ch.7); it only FLAGS document structure and has RELINQUISHED 目標規定文 + doc-scale 重点先行 (木下 ch.2–3) to `structuring-documents`. 重点先行 is split by scale: paragraph topic-sentence = HERE (L3), document/section order = there.

**Open defects:**
- EN machine floor UNSHIPPED (no .vale.ini/Vocab) — English prose is VIBE-only; SKILL.md says so.
- coinage-flag / codemix-flag are high-recall/low-precision MIX aids; precision levers (sudachidict-full, collocation, LM-surprisal) designed, not shipped.
- 15 multi-sense 国語研 words were never hand-added — MOOT (the dictionary itself was retired, below).

**Retired decisions (do not resurrect):**
- `prh-gairaigo.yml` (161-word 国語研 dict as external floor) — REVERSED same day; 2006 public-register list ≠ 2026 declared reader.
- Hand-maintained bash denylist (`check-prose-grounding.sh`) — superseded by textlint delegation.
- "internal register leaves ルー語 alone" — RETRACTED; replaced by the hygiene corollary.

## Lineage of reforges

- **#1 (2026-07-03)** rename `auditing-audience-facing-prose` → `grounding-prose` + re-anchor every
  violation class to the established taxonomy (Orwell / Grice / Gopen & Swan / plain-language).
- **#2 (2026-07-03, v2607.3.0)** field-failure postmortem: the reader anchor (AUDIENCE check), C9
  insider-register export, term budget, write-time protocol.
- **#3 (2026-07-04, v2607.4.0)** rename `grounding-prose` → `linting-prose`; machine-floor delegation
  to `textlint`/`Vale`; the Kinoshita four-layer + register/lifecycle frame; the HARD/MIX/VIBE tier
  (JakobThumm); the lifecycle-integrity family. THIS section documents #3; #1/#2 findings preserved below.
- **#5 (2026-07-05, v2607.6.0)** FIX-LOCALITY re-cut with `structuring-documents` (user: the split
  read ARBITRARY). Grounded in an 11-agent survey of 木下『理科系の作文技術』 (provenance-verified:
  修飾語の語順/係り受け/「黒い目のきれいな女の子」 = 本多勝一・井上ひさし, NOT 木下; 格調 ≠ 木下 goal).
  RELINQUISHED 目標規定文 + document-scale 重点先行 (木下 ch.2–3) to `structuring-documents`; this skill
  keeps 木下 ch.4–8 (paragraph→word, rewrite-in-place) + 事実と意見/スリカエ, and L4 now only FLAGS
  document structure. Edits: SKILL.md (description/scope/lineage/L4 row + Kinoshita layer note) +
  patterns.md F-L4. Runtime cut question: "rewrite words in place, or move information across the
  document?" Verification: 5-lens adversarial fleet — results appended on completion.

## 2026-07-04 reforge #3 (v2607.4.0)

**Motivation (highest-grade source: an observed production failure).** The QOED research repo
(`/home/fuyu/Workspace/qoed`) was audited by a 7-agent fleet → 71 findings. Three failure systems,
none of which the incumbent `grounding-prose` fully covered:
1. internal-ledger register exported to every reader class (C9 — incumbent covered this, its crown jewel);
2. **append-only self-correction** — retracted claims left standing in tables/headings/self line-refs
   (NO incumbent family, NO canon, NO tool → the new F-lifecycle family);
3. denylist auto-substitution corrupting body text and code identifiers (`非飽和iciency`;
   `find_違反点_scf`) → the anti-auto-substitution rule in `machine-floor.md`.

**Survey (Opus 4.8, 4/5 topics, 147 rules inventoried + adversarial critique).** Findings that
shaped the design:
- The incumbent's hand-maintained L1/L2 + C8 denylist is a degraded self-textlint: everything it does
  is in `preset-ja-technical-writing` (23 rules) + `@textlint-ja/preset-ai-writing` (5 rules). →
  DELEGATE the HARD tier; retire the bash script; keep only audit-report theater.
- Coverage boundary is clean: L1/L2 surface = off-the-shelf; L2 係り受け (主述距離/修飾語順/逆茂木) =
  NO OSS (GitHub total=0), commercial 文賢 β only; L3/L4/register/lifecycle = no deterministic tool,
  LLM judgment. The skill's value is the last group.
- JakobThumm/proofreading [HARD]/[MIX]/[VIBE] adopted as the tier spine (credited).
- **Critique correction (load-bearing):** "既製=皆無" was overclaimed — JakobThumm and sciwrite ARE
  existing LLM skills doing EN academic L3/L4. The value prop was corrected in the SKILL.md
  description and SPEC §0 to: register-export + lifecycle + JP/EN + terminology-injection, NOT
  "nobody does this."
- **Critique correction:** layer tags were inconsistent across survey agents (no-ai-hype: L1 vs
  register) → the layer taxonomy has ONE home (`patterns.md` C1–C9 map + the six families).

**Forge mode:** SOLO (user-chosen). SKILL.md and patterns.md carry a tightly-coupled tier table;
solo keeps them coherent. machine-floor.md + assets + this ledger drafted in the same context.

**Machine-floor probe (proven, not assumed).** `bunx textlint` installed with the presets + the C9
prh dict was run over five QOED files:
- `RESEARCH_STATE.md`: prh fired 10× on `PASS`/verdict enums, plus `no-successive-word`, `max-kanji`.
- `R2606_081` (the lifecycle exemplar): 97 findings incl. `sentence-length` ×52, `no-ai-list-formatting`
  ×16, `no-ai-colon-continuation` ×4.
- `README`: `sentence-length` ×10, `no-ai-list-formatting` ×6.
- `BENCHMARKS.md` (the clean control): 16 minor findings — confirms the floor is not all-noise.
The `--external` C9 set (`[A-Z]{3,}_[A-Z_]{3,}`, `[A-Z]{1,3}[0-9]{4}_[0-9]{2,3}`, `PASS`) is proven
to fire on the verdict-enum table; a clean paragraph passes.

**De-risk of the VIBE tier (critique's #1 concern — can an LLM stably judge L3/L4?):** partially
pre-answered by the QOED audit — 7 independent agents converged on register-export + lifecycle with
quoted evidence (high inter-agent agreement). The VERIFY forward-test (below) closes the rest with
the 71-finding corpus as ground truth.

### #3 verification findings (7 Opus lenses, refutation-first, read-only)

**Forward-test result (the critique's #1 de-risk — can the SKILL ALONE make an executor catch the
VIBE failures?): BOTH PASSED.** A fresh agent given only SKILL.md + patterns.md, auditing QOED
`RESEARCH_STATE.md`, caught the register-export and thesis curse-of-knowledge failures via F-register
+ rewrite-ledger #11; another, auditing `R2606_081`, caught the append-only self-correction (a claim
retracted in the body but kept in the summary table + heading) via F-lifecycle. The VIBE tier works
from the skill text alone.

| Severity | Lens | Finding | Resolution |
|---|---|---|---|
| major | self-contradiction | HARD/MIX/VIBE tier tags disagreed across files — dearu/desumasu used as the canonical MIX example but HARD elsewhere; verbal false limbs "all HARD" in SKILL.md but MIX in patterns.md; "is a prh-dict hit HARD or MIX?" answered both ways | Stated the prh-split rule ONCE (deterministic entries = HARD; metaphor/coinage tokens = MIX); moved dearu/desumasu to HARD; marked verbal false limbs MIX; reconciled every family header and C-map row |
| major | architecture | the layer taxonomy had a SECOND home — machine-floor.md's coverage table carried a family·layer column that disagreed with patterns.md's C1–C9 map (C8 family, ja-no-weak-phrase layer) | Dropped the family·layer column from machine-floor.md; it is now rule→check only, with the layer's single home declared to be patterns.md |
| major | architecture / comparative | `--external` was a fictional textlint flag (referenced 4×); the C9 register set was always-on and false-positived on internal working docs | Split into two configs (`textlintrc.json` base + `textlintrc-external.json`) and two prh dicts (`prh-house.yml` always-on + `prh-external.yml` C9). Proven: internal doc → base 0 hits, external 3 hits |
| major | comparative | F-L4 claimed conclusion-first/BLUF while the description disclaimed "document structure → designing-presentations" — a self-race on ask "結論が埋もれてる" | Narrowed the disclaimer to "deck structure, section order, slide ownership"; the family clause now reads "document logic" — prose-level conclusion placement is claimed, deck structure routes out |
| major | comparative / sibling | machine-floor.md called `check-prose-grounding.sh` "retired/SUPERSEDED" while it was still the only wired gate (mise `lint:prose-grounding`) — false in-repo | Resolved in the FIX ripple: retire the script + rewire the mise task to `bunx textlint`, making the claim true before ship |
| minor | bloat / spec-fidelity | description grew past 1500; "grounding" trigger dropped (would orphan); terminology-table "every house term" overclaim; ≤3 and ≤100 numbers restated (second home); prh "two roles" mislabeled; QOED coined-labels shipped as unfenced graveyard | description → 1486 with "grounding" re-added; overclaim softened to "anchored, declared, or defined inline"; numbers one-homed; prh section rewritten as two dicts; QOED entries fenced as ⚠ PER-REPO EXAMPLES |
| critical | architecture / sibling / comparative | STALE-DIR — the rename's other half was undone: `grounding-prose/` still shipped an active SKILL.md, racing linting-prose on every prose ask; 9+ sibling pointers (incl. a double-stale `auditing-audience-facing-prose` in prompting-llms, and the `detect-audit-theater.sh` grep) still named the dead skill | Resolved in the FIX ripple (below): retire `grounding-prose/` + `check-prose-grounding.sh`; rewrite all sibling pointers to `linting-prose`; add `linting-prose` to the Stop-hook grep; `mise run link:skills` |

**No `既製=皆無` overclaim** (spec-fidelity lens confirmed): every "no off-the-shelf" claim is scoped
to a specific check (L2 係り受け, L3 paragraph logic, tool-first titles, F-lifecycle) — the corrected
value-prop the SPEC §0 mandated.

## Fire / no-fire set (re-run as a desk-check after any description edit)

| # | Ask | Expected |
|---|---|---|
| F1 | 「このアブストの LLMっぽい表現を直して」 | FIRE |
| F2 | "prose lint of this proposal" | FIRE |
| F3 | 「スライドタイトルが tooling-first になってないか見て」 | FIRE (F-L4 C6) |
| F4 | 「この報告書、造語が多くて読めない — 用語を揃えて」 | FIRE (F-register / terminology table) |
| F5 | "the claim in this rebuttal feels overclaimed — calibrate it" | FIRE (claim calibration) |
| F6 | 「監査レポートが PASS を連発してる、直して」 | FIRE (audit theater; the Stop hook co-enforces) |
| F7 | 「外賓向けの1枚資料を作って」(before any drafting) | FIRE (write-time protocol: audience line + term budget) |
| F8 | "draft the executive summary for the customer deck" | FIRE (generation-time; external register) |
| F9 | 「この資料、内輪用語だらけで外部に出せない」 | FIRE (F-register insider export) |
| F10 | 「この README、後で撤回した主張が表に残ってないか見て」 | FIRE (F-lifecycle — new) |
| F11 | 「この文章に bunx textlint かけて直したい」 | FIRE (machine floor — new) |
| F12 | 「この段落、結論が最後まで読まないと分からない」 | FIRE (F-L4 conclusion-first / BLUF) |
| N1 | 「このスライド、順番がおかしい」 | NO-FIRE → designing-presentations (structure/order) |
| N2 | "add a lint gate to CI so this never happens again" | NO-FIRE → operating-the-harness (wiring) |
| N3 | 「この SKILL.md の description を直して」 | NO-FIRE → forging-skills (model-facing prose) |
| N4 | "survey these 30 papers on prose style" | NO-FIRE → systematizing-knowledge (corpus) |
| N5 | 「この段落の数学的内容が正しいか確認して」 | NO-FIRE (technical content; prose-only ⇒ no truth verdict) |
| N6 | fixing a typo in one sentence | NO-FIRE (no ceremony) |
| N7 | 「社内向け作業ログに receipt と verdict enum を書いて」 | NO-FIRE for F-register (internal register is the audit grammar's home) |

## 2026-07-03 reforge #2 — field-failure postmortem (v2607.3.0) — preserved

Trigger: an external-audience (外賓) portfolio one-pager shipped saturated with insider coinage
(~30 terms: agnostic/aware, menu 跳躍, cell, receipt:, R2607_XXX ledger IDs, verdict enums) and this
skill's own audit grammar — while satisfying the v2607.2.0 LAW verbatim.

| Severity | Finding (design defect) | Resolution |
|---|---|---|
| critical | LAW's "shared taxonomy" left the reader unbound — a document grounded ONLY in the project's ledger passed | LAW re-anchored to the DECLARED READER; Reader corollary; AUDIENCE check runs before everything |
| critical | The skill's own audit register (receipt:, gated, bounded-PASS, verdict enums) had no containment rule and leaked into the deliverable as "diligent" style | C9 + Register containment (Report discipline) + mapping table |
| major | Trigger surface was audit-only; nothing fired at generation time | Write-time protocol (5 steps, audience line first); BEFORE-writing + 外賓/社外/顧客 triggers |
| major | Terminology-table mandate read as a coinage license | Term budget: ≤3 define-at-first-use per page-equivalent (external) |
| major | Machine gate instance-overfit to a prior project's tokens; same-class novel coinage passed | `--external` C9 pattern set (now the prh dict); protocol step 5 mandates the judgment pass |

## 2026-07-03 reforge #1 findings — preserved

| Severity | Lens | Finding | Resolution |
|---|---|---|---|
| major | reframe | The terminology table claimed "every house term" while six load-bearing terms lived outside it — failing its own C7 | Six rows added |
| major | reframe | No F3 artifact shipped with the reforge | This file + the fire/no-fire set |
| minor | reframe | "packaging" mislabeled *anchored* (it is *derived* — a house umbrella over Orwell's vices) | Status corrected |
| minor | reframe | Sibling cuts untyped on this side | PURPOSE cuts typed |
| minor | preservation | Flagger JSON schema unified to five slots | Deliberate — no change |

Preservation regression (carried into #3): all C1–C9 tokens (床/鎖/背骨/殺す/moat/好例/この実務の執念から/
通過/正直な到達点), the terminology table, the calibration + audit-report ledgers, and the six
declared-novel items are preserved — mapped into the six families in `patterns.md`, not deleted.

## 2026-07-04 external review — 4 findings (all reproduced live before fixing)

| Severity | Finding | Verification | Resolution |
|---|---|---|---|
| high | description 1636 chars > the 1536 truncation contract; ledger's "→ 1486" stale vs the file | python fold-count: 1636 (over by 100) | CAUSE: the 2026-07-04 reciprocal-pointer edit (structuring-documents cut) added ~150 chars AFTER the ledger row — the ledger was correct at forge time. Description re-cut (pointer compressed; "never re-implements a preset's regex" now body-only — it was a second home of the Enforcement corollary) |
| high | prh detect-only was prose-only — `textlint --fix` substitutes, and the house replacements are GUIDANCE text, so --fix injects meta-instructions into the document | `--fix --stdin` smoke: `receipt:`/`R2607_016`/`PASS` → "Fixed 3 problems" | `scripts/lint-floor.ts` wrapper refuses `--fix` (exit 2); SKILL.md gate + machine-floor.md route the floor through it; wrapper added to the build-order verify line |
| medium | build-order verify one-liner exits 1 on a CLEAN tree (`test -d X && echo` is false when X absent) | clean run: EXIT 1 | inverted to `test ! -d ../grounding-prose || echo STALE-DIR`; `test -f scripts/lint-floor.ts` check added |
| medium | EN machine floor unpackaged — machine-floor.md describes Vale/proselint but no `.vale.ini`/vocab ship | `ls assets/`: JA-only (4 files) | OPEN — deliberately NOT shipping an untested config; packaging needs a Vale-packages survey + a proven-to-fire smoke first. Until then the EN floor section is guidance and EN prose gets the VIBE pass only |

## 2026-07-04 survey — novel-coinage detection (prior-art distilled, prototype-verified)

Trigger: the model calqued the English house-token *machine floor* → 「機械床」 while explaining
this skill; the deterministic floor passed it. 15-agent web/GitHub/npm survey + local prototype.

| What | Finding | Status |
|---|---|---|
| AI-slop preset | `@textlint-ja/preset-ai-writing` v1.7.0 = FIXED ~25-phrase hype list; zero generalization to unseen coinage (source-read) | explains the miss; already installed |
| naive freq | `wordfreq` scores 機械床 zipf 4.37 ("common") — re-tokenizes & estimates from components | DISPROVEN, recorded so nobody wires it |
| dict-membership | SudachiPy SplitMode.C splits non-headword compounds → `scripts/coinage-flag.py` | PROVEN fires on 機械床/再フレーム; MIX (FP on 量子計算/責務分離) — high recall, low precision |
| retroactive | 機械床/再フレーム added to `prh-house.yml` graveyard (detect-only) | HARD for those terms thereafter |
| ルー語/外来語 | prh dict from 国語研 外来語言い換え (HARD, external-only); katakana-ratio (MIX); off-the-shelf = orthography-WIP or noisy | distilled into machine-floor.md |
| config presets | AGENTS.md/CLAUDE.md preset ecosystem surveyed (config-preset lane) | routes to operating-the-harness — separate distillation, NOT done here |

Open: `sudachidict-full`/NEologd + collocation-PMI or LM-surprisal (rinna/japanese-gpt2) would lift
precision — heavier, not shipped. EN machine floor still unpackaged (prior finding, still OPEN).

## 2026-07-04 consuming-repo finding (QOED) — dearu-register false positive

A consuming session (QOED, である体 research records) exercised the shipped floor and correctly
diagnosed a defect I shipped, verified here empirically:

| Severity | Finding | Verification | Resolution |
|---|---|---|---|
| high | base `textlintrc.json` hard-prefers ですます (`no-mix-dearu-desumasu` preset default `preferInBody:ですます`) → false-positives EVERY である sentence in a dearu-style internal/research doc | pure である体 (である:2, ですます:0, no mixing) → 2 spurious `no-mix-dearu-desumasu` errors; pure ですます → silent | shipped `assets/textlintrc-research.json` (`preferInBody:である`, strict:false): pure である → clean, ですます-dominant → flagged, prh coinage + ai-writing preserved. Wired into SKILL.md step 4, build-order verify, machine-floor.md profile table |

Note on the correct override syntax (cost one iteration): a preset-internal rule is overridden by
NESTING it inside the preset object (`"preset-ja-technical-writing": { "no-mix-dearu-desumasu": {..} }`),
NOT via a top-level `preset/rule` key — the latter yields textlint "No rules found".

Consumer behavior was exemplary: it did NOT obey the false positive, diagnosed the config mismatch,
declined to churn a house-wide `**bold**:` pattern (AI-slop `no-ai-list-formatting`, ~40 hits, a
house-wide style decision, not per-edit), and surfaced that the repo's own `mise.toml lint:prose`
points at a non-existent `scripts/textlintrc-research.json` and silently passes via `|| true` — a
real harness defect ON THE CONSUMING SIDE (fix: repoint it at this skill's `textlintrc-research.json`).

## 2026-07-04 incident — code-mixing (ルー語) passed a green floor (QOED R2607_021)

Symptom: a consuming session, following this skill mechanically (audience line declared, floor
green, five-slot report), generated NEW prose at 15 latin tokens/100 JA chars — "cite する",
"deliverable である", "moat を主張しない" — and the owner rejected the document quality.

| Cause (in the SKILL, not the agent) | Evidence | Fix |
|---|---|---|
| F-register modeled register ONLY as vocabulary-sharing → "internal reader holds the terms" fired nothing; the survey note even said "internal register leaves ルー語 alone" | R2607_021 diff: agent's own new §0/§2 lines carry the calques; floor 0 problems | Prose-language discipline added to F-register: comprehension vs HYGIENE split; verb calque + exact-equivalent noun = violation in ANY register. machine-floor.md sentence RETRACTED in place |
| Survey distilled code-mixing levers as notes but shipped NO check (external-only prh idea, ratio "usable MIX signal" unwired) | assets/ had no rule; grep floor green on the incident doc | prh role 3 (verb-calque regex + deliverable/framing/moat) ALWAYS ON; scripts/codemix-flag.py (zero-dep density flagger, threshold 8; incident doc = 15) |
| Register contagion: the operator/audit register (this skill's own tokens, the session's mixed prose) is the few-shot the generating model mirrors | agent report + new doc lines share the register | Not fixable by a rule alone — the write-time protocol's step 3 (draft in the READER's vocabulary) now has a floor that goes red; residual is VIBE |

Boundary kept: only the GRATUITOUS class is a defect. Standard domain terms (fidelity, CNOT) and
pinned house tokens (campaign, IF-1, decision cost — grep anchors) STAY; blanket translation would
repeat 非飽和iciency. Agent behavior was correct throughout — the skill was the defect.

## 2026-07-04 adopt-first correction — 国語研 dictionary wired (was documented-but-unwired)

Owner challenge: "presets were surveyed — why hand-roll?" Verdict: partially right. The survey
HAD found the one ready-made resource (国語研「外来語」言い換え提案) and machine-floor.md cited it,
but nothing was wired — while 3 hand-picked nouns went into prh role 3. Instance-overfit again.

| Action | Receipt |
|---|---|
| Adopted the primary source mechanically: 総集編 PDF → 161/176 pairs auto-extracted (pypdf; 15 multi-sense words e.g. アクセス skipped, listed in file header) → `assets/prh-gairaigo.yml` | extraction log; YAML valid (161 rules) |
| Wired into `textlintrc-external.json` ONLY (internal technical カタカナ is legitimate) | external: アジェンダ→検討課題/コンセンサス→合意/ガバナンス→統治 fire; base config: 0 hits |
| Sourcing ladder made explicit in machine-floor.md: ADOPT > CONFIGURE > AUTHOR (author only with a survey receipt that nothing exists) | the remaining custom pieces each carry that receipt: verb-calque regex, coinage-flag (Breen technique, no package), codemix-flag (density, no package) |

## 2026-07-04 reversal — gairaigo dictionary floor removed (owner falsified, same day)

`prh-gairaigo.yml` (161 語, 国語研 2002-2006 言い換え提案の機械採録, external-only) was shipped and
REVERSED within hours. Owner's one-line refutation: 根付いているカタカナ外来語はそのまま使えばいい.

| Why the adoption was wrong | Evidence |
|---|---|
| Violated the skill's own DECLARED READER law: substituted a 2006 general-public/公共文書 list for the actual 2026 reader's vocabulary | dict flags ツール→道具, バリアフリー→障壁なし, ガバナンス→統治 — the official JPX term is コーポレートガバナンス・コード |
| 20-year staleness: the list's own design is 理解度-stratified for 2004-06 readers; many entries have since rooted | インフラ→社会基盤, コミュニティー→地域社会 are standard 2026 vocabulary |
| A noisy floor is a dead floor (the QOED `\|\| true` lesson) — blanket adoption would train consumers to ignore the external config | — |

Mechanism note (vs pendulum): reversal on NEW cited evidence (rooted-word hits), not mood. The
ADOPT>CONFIGURE>AUTHOR ladder survives — but ADOPT is also reader-gated: an established dictionary
still fails if its implied reader is not the declared reader. What survives for ルー語: prh role 3
(latin verb-calque + exact-equivalent nouns) + codemix-flag density — the actual incident class.
Katakana rootedness = VIBE against the audience line; the 国語研 list = per-repo reference only.

## 2026-07-04 subsume+exceed — dominated the community "AI時代 決定版" config

Owner: "Gemini の回答を包摂して上回れ." Result: every real component subsumed, 2 exceed-points
where the community config is WRONG, 3 layers it lacks entirely. All npm/run-verified.

| Community claim | Reality (verified) | Skill's answer |
|---|---|---|
| `en-ja-translator-find-english` = the code-mixing rule | **E404, does not exist** | working impl: prh catch-all `/[A-Za-z…]/` + `allowlist` filter (v4.0.0) in `textlintrc-strict.json` — proven flags validation/deliverable, allowlists fidelity/CNOT, excludes `code` spans |
| MCP `--fix` loop = the modern workflow | `--fix` injects prh guidance text into the doc | `lint-floor.ts` refuses `--fix` (exit 2) |
| one config for all writing | false-positives every である sentence | 3 register profiles |
| L1/L2 machine layer is the goal | misses logic/coinage | VIBE (L3/L4/スリカエ/register/lifecycle) + kanji-coinage flagger |

Shipped: `assets/prh-codemix.yml`, `assets/textlintrc-strict.json` (opt-in; `bun add -g
textlint-filter-rule-allowlist`). `preset-ja-spacing` v3.0.2 = opt-in per-repo orthography, NOT
forced (gairaigo lesson: an orthography policy is reader/repo-relative). Note: article's package
names have been wrong 3×/3 (〜と思う ban, en-ja-translator-find-english, foreign-language-writing
scope) — trust npm view, not the blog aggregation.

## 2026-07-04 reforge #4 (v2607.5.0) — hostile audit: append-only decay

External hostile audit (owner-commissioned) found the disease precisely: 8 same-day hot-fixes were
all APPENDED, never consolidated — the skill violated its own repair-spiral rule at skill level.
Verdict accepted; reforged, not patched.

| audit finding | action |
|---|---|
| SKILL.md kitchen-sink (298 lines: glossary, calibration chapter, notation, gate wiring in core) | core rewritten to ~150 lines: law / tiers / gate / taxonomy / report contract / execution / fire-no-fire / index. Glossary+notation → patterns.md; wiring → machine-floor.md |
| six families + secret extra chapters (calibration, non-negotiables, beyond-words) | taxonomy restated as **4 layers × 3 axes** (register, lifecycle, **calibration promoted to axis**) — no hidden chapters; non-negotiables folded into report contract & L4 row |
| EN floor promised in core, unshipped in assets | core says "EN floor is UNSHIPPED — VIBE only"; machine-floor EN section banner STATUS: UNSHIPPED |
| fire/no-fire buried in ledger | `tests/triggers.md` created (7 fire / 7 near-miss no-fire); core points to it; build-order verifies it |
| "green floor ≠ done" in 5 places | ONE home: machine-floor FP-advisory boundary; core states it once inside gate step 2 |
| ledger = undifferentiated append log | CURRENT STATE head added (invariants / open / retired) so a reader model cannot absorb dead policy |
| sibling drift: structuring-documents described linting-prose as external-only | reciprocal row updated (register-independent hygiene) |

Dissents recorded (not adopted from the audit): (1) the 120-line hard cap has no house source —
the contract is one-home + lean, landed ~150; (2) claim calibration NOT absorbed into F-L4/register
(would bury the most-fired check) — promoted to a third axis instead, which also satisfies the
no-secret-families bar; (3) a pinned-token table is house pattern (forging-skills keeps one) — the
defect was SIZE in core, fixed by moving the full table to patterns.md.

## 2026-07-04 v2607.5.1 — seam completion (addendum to reforge #4)

Owner falsified the "orthogonal axes" justification of the structuring-documents cut. Corrections,
landed on BOTH sides: (1) L4 label "structure" → **document logic** (SKILL.md scope+taxonomy,
patterns.md headings/C-map/glossary) — the old label collided with the sibling's name;
(2) handoff protocol stated in the L4 row (flag here, rebuild there) and mirrored in
structuring-documents' routing row + its new F3 ledger; (3) patterns.md flagger contract fixed —
it mis-routed document-structure findings to designing-presentations (deck-era residue); now:
L3/L4 findings are OWN, slide/figure → designing-presentations, reorganization → structuring-documents.
