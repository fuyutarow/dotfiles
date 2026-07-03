# Forge verification ledger — this skill's F3 artifact

The adversarial-verification findings ledger the forging-skills gate F3 demands. Append on any
future reforge; never overwrite.

## Lineage of reforges

- **#1 (2026-07-03)** rename `auditing-audience-facing-prose` → `grounding-prose` + re-anchor every
  violation class to the established taxonomy (Orwell / Grice / Gopen & Swan / plain-language).
- **#2 (2026-07-03, v2607.3.0)** field-failure postmortem: the reader anchor (AUDIENCE check), C9
  insider-register export, term budget, write-time protocol.
- **#3 (2026-07-04, v2607.4.0)** rename `grounding-prose` → `linting-prose`; machine-floor delegation
  to `textlint`/`Vale`; the Kinoshita four-layer + register/lifecycle frame; the HARD/MIX/VIBE tier
  (JakobThumm); the lifecycle-integrity family. THIS section documents #3; #1/#2 findings preserved below.

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
