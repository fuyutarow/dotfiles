# Machine floor — the delegated deterministic (HARD) tier

The one place this skill talks to `textlint` / `Vale`. It owns the "existing tools — do not reinvent"
boundary: the HARD tier is DELEGATED to mature linters, never hand-coded. The JUDGMENT (MIX/VIBE)
lives in `patterns.md`; this file lives in `machine-floor.md`.

> **Why a floor at all — and why not our own.** The retired `grounding-prose` shipped a
> hand-maintained bash denylist (`check-prose-grounding.sh`). Everything it did at the word/sentence
> level, `textlint` presets already do — with morphological analysis the regex could not. It was a
> degraded self-textlint. A denylist loses to coinage by construction (QOED: 11 banned tokens vs 68
> controlled-vocabulary entries, and `PASS` still appeared 314 times). So the floor is delegated; the
> skill configures it and spends its own effort on the layers no linter reaches.

## Execution — `bunx`, never `npx`

House rule: use `bunx`. Every upstream doc says `npx`; translate. No global install needed —
`bunx` fetches on demand.

```bash
# one-time, GLOBAL (install once, works in every repo — verified: after this both `bunx textlint`
# and `textlint` resolve these presets from any cwd, so no per-repo `bun add -d` is needed):
bun add -g textlint textlint-rule-preset-ja-technical-writing \
  @textlint-ja/textlint-rule-preset-ai-writing textlint-rule-prh

# lint a file / tree with the house config
bunx textlint --config assets/textlintrc.json path/to/doc.md
bunx textlint --format json path/to/doc.md   # structured findings for an agent loop
```

## Register profiles — pick the config by the document's register (2026-07-04)

The floor ships THREE JA configs; run all via `scripts/lint-floor.ts` (`LINT_PROSE_CONFIG=<path>`).
The choice is not cosmetic: `preset-ja-technical-writing` sets `no-mix-dearu-desumasu` with
`preferInBody = ですます` by DEFAULT, so the base config **false-positives EVERY である sentence** in
a dearu-style doc (verified: a pure である体 record → 2 spurious errors; caught by a consuming repo,
QOED, on its internal research records).

| Config | Body register | Use for |
|---|---|---|
| `assets/textlintrc.json` | **ですます** (default) | external-ish / customer / general docs written in ですます |
| `assets/textlintrc-research.json` | **である体** (`preferInBody:である`, `strict:false`) | internal / research / academic records (paper-style である体). Pure である → clean; ですます-dominant → flagged; minor mixing tolerated |
| `assets/textlintrc-external.json` | ですます + C9 register set | field-facing deliverables — also HARD-detects insider register (ledger IDs, verdict enums, `PASS`, `receipt:`) |

A consuming repo whose records are である体 (research logs, design docs) MUST point its lint task at
`textlintrc-research.json`, never the base — otherwise the floor is all-noise and gets `|| true`-ignored.

Global vs local: the global install is the ergonomic default for a personal multi-repo setup. A
shared repo or CI job that needs reproducibility should still `bun add -d` the same packages and
commit the lockfile — a global install is not captured by any lockfile. Either way the config and
commands are identical; only where the packages live differs.

MCP (generation → lint → fix loop, textlint ≥ v14.8.0):
`claude mcp add textlint -s project -- bunx textlint --mcp`. Four tools: `lintFile`, `lintText`,
`getLintFixedFileContent`, `getLintFixedTextContent`. The `getLintFixed*` tools return fixed content
non-destructively — see the anti-auto-substitution rule before trusting them.

## JA stack — what each preset covers, so the skill does NOT re-check it

`preset-ja-technical-writing` (23 rules, mostly morphology/kuromoji) and
`@textlint-ja/preset-ai-writing` (5 rules) between them own the entire HARD tier for Japanese. Every
rule below is HARD. The sourcing ladder is **ADOPT > CONFIGURE > AUTHOR**: adopt a published
preset/dictionary first (ja-technical-writing, ai-writing, prh-gairaigo); configure an existing
rule's options second (the research profile is `no-mix-dearu-desumasu`'s own `preferInBody`);
author a custom pattern/script ONLY with a survey receipt that nothing exists (verb-calque regex,
coinage/codemix flaggers — 2026-07-04 survey, ledger). The map is the "do not re-implement"
contract — if a row is here, the skill
delegates it and never writes a matching regex. **Family/layer assignment is NOT decided here** — its
single home is the C1–C9 map in `patterns.md`; this table stays rule→check so the layer taxonomy has
one owner.

| rule | checks (all HARD) |
|---|---|
| `sentence-length` (≤100) | overlong sentence |
| `max-ten` / `max-comma` (≤3) | 読点 overload |
| `max-kanji-continuous-len` (≤6) | unreadable kanji run |
| `no-double-negative-ja` | 二重否定 |
| `no-dropping-the-ra` | ら抜き |
| `no-doubled-joshi` | same 助詞 in one clause |
| `no-doubled-conjunctive-particle-ga` | 逆接 が repeated |
| `no-doubled-conjunction` | repeated 接続詞 |
| `ja-no-weak-phrase` | ぼかし / 弱い表現 (かもしれない…) |
| `ja-no-redundant-expression` | 冗長 (することができる…) |
| `ja-no-abusage` | 漢字 misuse |
| `no-mix-dearu-desumasu` | 常体/敬体 mixing |
| `ja-no-mixed-period` | mixed sentence terminators |
| `no-exclamation-question-mark` | ! ? in a technical register |
| `no-ai-hype-expressions` | 革命的 / ゲームチェンジャー / 究極の … |
| `no-ai-list-formatting` | mechanical **bold**: / emoji-led bullets |
| `no-ai-emphasis-patterns` | `**非常に**重要`, bold-in-heading |
| `no-ai-colon-continuation` | 述語終止 + colon + block (English-ism) |
| `ai-tech-writing-guideline` | 冗長 / passive / abstract→specific / 用語ゆれ (severity: info) |
| `prh` (house dict) | 表記ゆれ + coined-label denylist; the external dict adds the C9 register set |

`ai-tech-writing-guideline` is the one preset rule that reaches toward L3 — run it at `severity: info`
as a SUGGESTION, not a blocker. It does not judge topic-sentence presence; that stays VIBE.

**Two prh dicts, so the noisy register set never fires on internal docs.**
- `assets/prh-house.yml` (always on, via `textlintrc.json`): (1) 表記ゆれ / terminology normalization
  — the portable part; (2) the coined-label graveyard — a repo's KNOWN bad coinage, seeded per repo
  (the shipped entries are QOED examples, fenced and meant to be replaced; the QOED
  `check_banned_labels.jl` generalization). Detect-only for coinage.
- `assets/prh-external.yml` (added by `textlintrc-external.json`, ONLY for external-register docs):
  the C9 register set the presets do NOT carry — ledger IDs `[A-Z]{1,3}[0-9]{4}_[0-9]{2,3}`, verdict
  enums `[A-Z]{3,}_[A-Z_]{3,}`, `receipt:`, `PASS`-as-verdict. These legitimately appear in internal
  working docs, so they are gated behind the external config, never the base one. Proven to fire on
  QOED `RESEARCH_STATE.md`; see `tests/forge-verification-ledger.md`.

## Wiring the gate (mise/CI/hook) — moved from SKILL.md at reforge #4

Willpower is not a harness; the floor is only real when it is in the command you actually run.

- Wire `scripts/lint-floor.ts` (never raw `textlint` — the wrapper refuses `--fix`) into the repo's
  mise task / CI over rendered audience-facing files; exclude design docs, denylist ledgers, and
  orphan drafts (they legitimately contain the banned tokens). Pick the register profile per the
  SKILL.md gate table.
- **Prove it fires**: inject a known-bad string, watch it FAIL, revert. A rule never seen red is
  decoration.
- A check not in the aggregate command is not enforced; a noisy misconfigured floor gets
  `|| true`-ignored and is equally dead (the QOED lesson — see ledger).
- The Stop hook `detect-audit-theater.ts` co-polices the agent's own turn text; scripts own the
  greppable tier — never spawn an agent to run the lint.

## EN stack — **STATUS: UNSHIPPED (guidance only)**

> No `.vale.ini`, no Vocab assets ship with this skill yet. Until they do, English prose gets the
> VIBE pass only — do NOT claim a Vale run (ledger: open defect). Packaging path when needed:
> `vale sync` the packages below, prove-fire, then ship the config here.

- **Vale** (`errata-ai/vale`) + the Google (31 rules) and Microsoft (~39 rules) packages +
  `proselint` (50+ checks: hedging, weasel, jargon, cliches, corporate_speak). Rule types:
  `existence`, `substitution` (禁止語→推奨語 swap), `occurrence`, `consistency`, `conditional`,
  `capitalization`, `metric`, `spelling`, `sequence`, `script`.
- **Vocab is the terminology-table machine impl:** `accept.txt` → `Vale.Terms` (approved surface
  forms enforced — the terminology table); `reject.txt` → `Vale.Avoid` (known coinage denylist — the
  C9 known set). Novel coinage still needs VIBE — a denylist blocks only what it already lists.
- **English AI-slop:** `slopless` (`bunx slopless`) — a deterministic textlint-preset + CLI, 50+
  rules in 7 families (metrics, orthography, phrases/words, academic/narrative slop, semantic
  thinness, syntactic patterns incl. negation-reframe, llm-openers, boilerplate-conclusion). JSON
  findings + exit code (0 clean / 1 findings / 2 failure) — CI/agent-loop ready. Its `install-skill`
  and generation→lint→fix loop are the design template the skill's harness map borrows.
- **LaTeX caveat:** Vale is NOT first-class TeX. For `.tex` sources use `textidote` or
  `misc0110/Paper-Linter`, or the textlint LaTeX plugin.

## The anti-auto-substitution rule (from the QOED postmortem)

**NEVER let a fixer rewrite blind.** QOED's denylist auto-replacement drove the substitution INTO
words and code — producing the non-word `非飽和iciency` (deficiency → 非飽和 mid-token) and
translating the code identifier `find_violator_scf` → `find_違反点_scf`, so grep no longer reached
the implementation. Consequences for this skill:

- `textlint --fix` and `getLintFixedTextContent` exclude fenced code blocks and inline-code spans;
  never run an autofix over identifiers.
- The `prh` coinage set runs **detect-only** — it flags, the model applies the fix with the five-slot
  discipline (a human-legible replacement, not a blind swap).
- **Mechanical enforcement (2026-07-04 review, F2):** run the floor via `scripts/lint-floor.ts`,
  which REFUSES `--fix` (exit 2). textlint treats prh entries as fixable, and the house dicts'
  replacement strings are GUIDANCE TEXT — a raw `bunx textlint --fix` injects meta-instructions
  into the document (verified live: `receipt:`/`R2607_016`/`PASS` all "Fixed"). Prose cannot
  enforce detect-only; the wrapper does.
- A substitution rule (`prh` / Vale `substitution`) is legitimate only for true 表記ゆれ (one spelling
  → the canonical spelling of the SAME word), never for coinage-to-plain-language (which is a
  judgment rewrite, VIBE).

## Detecting NOVEL coinage / ルー語 — the 機械床 gap (2026-07-04 survey + prototype)

The floor's AI-slop layer does **not** catch a freshly-coined word. Verified by reading the source:
`@textlint-ja/preset-ai-writing` (v1.7.0, current) is a **fixed hardcoded list of ~25 hype phrases**
(`革命的な`, `ゲームチェンジャー`, `パラダイムシフト`, …) plus structural-bullet regex — **zero
generalization** to an unseen compound. So when the model calqued the English house-token *machine
floor* into 「機械床」, every deterministic rule passed. There is **no off-the-shelf 造語 detector**;
this section is what the survey established as the real options, with what was proven and disproven.

**DISPROVEN — naive corpus frequency (do not wire this up).** Prototyped `wordfreq` (rspeer):
`zipf_frequency("機械床","ja") → 4.37` — scored "common", identical to `機械学習` (4.35). `wordfreq`
re-tokenizes multi-token input and estimates the compound from its components, so a coinage built
from common morphemes looks common. Unigram frequency cannot separate coinage from legit compound.

**PROVEN — dictionary-membership of the whole compound (MIX).** SudachiPy `SplitMode.C` returns the
longest *registered* unit. A noun run the text uses as one term but that splits into >1 unit is not a
dictionary headword → candidate coinage. Bundled as **`scripts/coinage-flag.py`**, run via `uvx`:

```bash
uvx --with sudachipy --with sudachidict-core python ${CLAUDE_SKILL_DIR}/scripts/coinage-flag.py < doc.md
```

Proven to fire (self-test): flags `機械床`, `再フレーム`; keeps `機械学習` / `深層学習` /
`計算機科学` as known units. **Tier = MIX, empirically:** it also flags `量子計算`, `責務分離`,
`認識体系` — legit-but-unlisted technical compounds. **High recall, low precision** — Japanese
technical prose is full of legitimate non-lexicalized compounds. So it is a **review aid for short
output** (eyeball a handful of candidates on the agent's own turn text), NOT a low-noise bulk gate,
NOT HARD. The machine narrows; the model confirms coinage vs. legit-unlisted. Prior art: Breen,
*Identification of Neologisms in Japanese by Corpus Analysis* (2010).

**Precision levers (heavier, not shipped):** swap `sudachidict-core` → `sudachidict-full` or
mecab-unidic-NEologd (bigger dict ⇒ fewer FPs like 量子計算); add a collocation gate (flag only if
the bigram is also rare in a web n-gram corpus — NWJC/BCCWJ); or score LM surprisal
(rinna/japanese-gpt2 + perplexity) for the highest precision — that one is VIBE-heavy (a model call).

**Retroactive HARD catch.** Once a coinage is confirmed, add it to the `prh-house.yml` graveyard
(detect-only) — deterministic thereafter. `機械床` and `再フレーム` were added there 2026-07-04. This
is how a noisy MIX detection becomes a zero-FP HARD rule for that specific term.

**ルー語 / 外来語 濫用 (English/katakana over-mixing).** No clean off-the-shelf overuse detector.
Off-the-shelf, verified: `@textlint-ja/preset-foreign-language-writing` is katakana *spelling*
orthography (WIP), not overuse; `textlint-rule-ja-sudachi-synonym-suggestion` nudges katakana→和語
but is a noisy VIBE suggester. House floor (ALWAYS ON since 2026-07-04, QOED R2607_021 incident —
a generated doc hit 15 latin/100字 with "cite する / deliverable である / moat" and the floor was
green): **prh role 3** in `prh-house.yml` HARD-catches verb calques (`/[a-zA-Z]{2,} ?する/`) and
exact-equivalent nouns (deliverable/framing/moat); **`scripts/codemix-flag.py`** (zero-dep) flags
paragraphs ≥8 latin/100字 as MIX — the model then classifies each token 3-way: standard domain term
(keep) / pinned house token (keep, identifier) / gratuitous (violate). This skill is the
FEEDBACK/detection layer at *deliverable* time; the UPSTREAM cure (the generation guardrail,
owned by `operating-the-harness`) is the only layer left for this pathology — a per-turn Stop
hook (`detect-prose-correo.ts`, correo calque layer) once gated the latin-verb+する residue on
every turn too, but was removed 2026-09-03 at the orderer's direct order, its per-Stop
regeneration cost having outweighed the catch. Code-switching is Language Confusion (Marchisio,
EMNLP 2024), and a gate cannot cure a generation pathology regardless. The earlier framing
"internal register leaves ルー語 alone" was WRONG and is retracted: internal waives comprehension,
not hygiene. Blanket translation is the opposite error (非飽和iciency) — pinned tokens and domain
terms stay. **Katakana rootedness is READER-relative — no dictionary floor.** The 国語研「外来語」言い換え提案
(2002-2006, 公共文書/一般層向け) was adopted wholesale as an external floor and REVERSED the same
day: it flags ツール→道具, バリアフリー→障壁なし, ガバナンス→統治 (the official JPX term is
コーポレートガバナンス・コード) — absurd against any 2026 professional reader. A 20-year-old
general-public list must not stand in for the DECLARED reader; 定着した外来語はそのまま使う.
Katakana admissibility is a VIBE judgment against the audience line. The list stays a REFERENCE
(<https://www2.ninjal.ac.jp/gairaigo/>) to consult ONLY if a repo genuinely writes for 一般層/行政
register — seed per-repo, per-reader, never as a shipped floor. The ルー語 floor that SURVIVES is
the incident class: latin-script mixing (prh role 3 verb-calque + deliverable/framing/moat) and the
density flagger — those target 地の文への英字混入, not rooted katakana.

## The FP-advisory boundary

Existing linters are noisy (write-good's passive check is "naive" by its own README; proselint over-
flags). Therefore:

- Ship configs **advisory by default** — a finding is a candidate, not a verdict. A check becomes
  **blocking** (fails CI) only after the team pins its thresholds and accepts its false-positive rate.
- A green `textlint` run proves only that the listed patterns are ABSENT in the scoped text. It does
  NOT prove clarity, logic, register fit, or lifecycle integrity — those are VIBE and unmeasured by
  any linter. Report residual checks separately.
- Prove any newly added rule fires: inject a known-bad line, watch it FAIL, revert. A rule never seen
  red is decoration.

## vs the community "AI時代 決定版" config — subsume + exceed (2026-07-04)

The Zenn/Qiita/note consensus config (technical-writing × ai-writing × code-mixing × spacing +
allowlist + MCP --fix loop) is SUBSUMED and exceeded. Verified component by component:

| Community 決定版 component | this skill | verdict |
|---|---|---|
| `preset-ja-technical-writing` | in all 3 base profiles | subsumed |
| `@textlint-ja/preset-ai-writing` | in all 3 base profiles | subsumed |
| `ja-unnatural-alphabet` (single-char) | bundled inside ja-technical-writing | subsumed |
| `en-ja-translator-find-english` (their code-mixing rule) | **E404 — does not exist** (npm-verified). Replaced by the WORKING impl: `prh-codemix.yml` catch-all `/[A-Za-z…]/` + `textlint-filter-rule-allowlist` (real v4.0.0) in `textlintrc-strict.json` — proven: flags validation/deliverable, allowlists fidelity/CNOT, excludes code spans | **EXCEED** (working impl of their fake package) |
| `textlint-filter-rule-allowlist` | wired (`textlintrc-strict.json`); `bun add -g textlint-filter-rule-allowlist` | subsumed |
| `preset-ja-spacing` (real v3.0.2) | OPT-IN, not forced — 和欧間スペース is a per-repo orthography policy (space vs no-space); baking one in false-positives the other (the gairaigo lesson) | consciously per-repo |
| MCP `--fix` auto-rewrite loop | `lint-floor.ts` **REFUSES `--fix`** — prh replacements are guidance text, `--fix` injects them into the doc (proven) | **EXCEED** (evidence-based safety they lack) |
| — (they have none) | **register profiles**: base ですます / research である体 / external insider — their single config false-positives every である sentence | **EXCEED** |
| — (they have none) | **VIBE layer**: L3 topic-sentence, L4 BLUF/スリカエ, register-export, lifecycle — no textlint config reaches these | **EXCEED** |
| — (they have none) | **kanji-compound coinage** (機械床): `coinage-flag.py` (SudachiPy) — their config is latin-only | **EXCEED** |

Three code-mixing tiers, effort matched to need: prh role 3 (always-on, catches the common calques
deliverable/framing/moat/verb-する, no allowlist) → `codemix-flag.py` (MIX density, zero-dep, zero
allowlist) → `textlintrc-strict.json` (HARD catch-all + allowlist, needs a maintained vocabulary).
Strict is register-orthogonal — it defaults ですます; a である体 repo copies the research profile's
`no-mix-dearu-desumasu` override into it (do not ship a strict×dearu combinatorial config).

## Sources (tooling)

- textlint <https://github.com/textlint/textlint> · MCP docs <https://textlint.org/docs/mcp/>
- `preset-ja-technical-writing` <https://github.com/textlint-ja/textlint-rule-preset-ja-technical-writing>
- `@textlint-ja/preset-ai-writing` (v1.7.0) <https://github.com/textlint-ja/textlint-rule-preset-ai-writing>
- `prh` <https://github.com/prh/prh>
- Code-mixing HARD path (community "決定版" intent, real impl): `textlint-filter-rule-allowlist` v4.0.0
  <https://github.com/textlint/textlint-filter-rule-allowlist> + prh catch-all. Their
  `en-ja-translator-find-english` is E404 (verified npm). `preset-ja-spacing` v3.0.2 (opt-in orthography).
- Vale <https://github.com/errata-ai/vale> (+ `errata-ai/Google`, `errata-ai/Microsoft`) · Vocab
  <https://vale.sh/docs/keys/vocab>
- proselint <https://github.com/amperser/proselint> · slopless <https://github.com/seochecks-ai/slopless>
- LaTeX: textidote, `misc0110/Paper-Linter` <https://github.com/misc0110/Paper-Linter>
- Coinage detection (survey 2026-07-04): SudachiPy <https://github.com/WorksApplications/SudachiPy>
  (SplitMode.C dict-membership → `scripts/coinage-flag.py`) · `wordfreq`
  <https://github.com/rspeer/wordfreq> (DISPROVEN for compound coinage — estimates from components) ·
  Breen, *Identification of Neologisms in Japanese by Corpus Analysis* (2010) ·
  国立国語研究所「外来語」言い換え提案 <https://www2.ninjal.ac.jp/gairaigo/> (loanword→和語 dict for prh)
