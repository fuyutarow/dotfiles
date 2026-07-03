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
# one-time: dev-dep the presets in the target repo (or rely on bunx auto-fetch)
bun add -d textlint textlint-rule-preset-ja-technical-writing \
  @textlint-ja/textlint-rule-preset-ai-writing textlint-rule-prh

# lint a file / tree with the house config
bunx textlint --config assets/textlintrc.json path/to/doc.md
bunx textlint --format json path/to/doc.md   # structured findings for an agent loop
```

MCP (generation → lint → fix loop, textlint ≥ v14.8.0):
`claude mcp add textlint -s project -- bunx textlint --mcp`. Four tools: `lintFile`, `lintText`,
`getLintFixedFileContent`, `getLintFixedTextContent`. The `getLintFixed*` tools return fixed content
non-destructively — see the anti-auto-substitution rule before trusting them.

## JA stack — what each preset covers, so the skill does NOT re-check it

`preset-ja-technical-writing` (23 rules, mostly morphology/kuromoji) and
`@textlint-ja/preset-ai-writing` (5 rules) between them own the entire HARD tier for Japanese. Every
rule below is HARD. The map is the "do not re-implement" contract — if a row is here, the skill
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

## EN stack

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
- A substitution rule (`prh` / Vale `substitution`) is legitimate only for true 表記ゆれ (one spelling
  → the canonical spelling of the SAME word), never for coinage-to-plain-language (which is a
  judgment rewrite, VIBE).

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

## Sources (tooling)

- textlint <https://github.com/textlint/textlint> · MCP docs <https://textlint.org/docs/mcp/>
- `preset-ja-technical-writing` <https://github.com/textlint-ja/textlint-rule-preset-ja-technical-writing>
- `@textlint-ja/preset-ai-writing` (v1.7.0) <https://github.com/textlint-ja/textlint-rule-preset-ai-writing>
- `prh` <https://github.com/prh/prh>
- Vale <https://github.com/errata-ai/vale> (+ `errata-ai/Google`, `errata-ai/Microsoft`) · Vocab
  <https://vale.sh/docs/keys/vocab>
- proselint <https://github.com/amperser/proselint> · slopless <https://github.com/seochecks-ai/slopless>
- LaTeX: textidote, `misc0110/Paper-Linter` <https://github.com/misc0110/Paper-Linter>
