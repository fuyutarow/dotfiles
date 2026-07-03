# Forge verification ledger — this skill's F3 artifact (2026-07-03 reforge)

The adversarial-verification findings ledger the forging-skills gate F3 demands. This reforge
(rename `auditing-audience-facing-prose` → `grounding-prose` + re-anchoring of every violation
class to the established taxonomy) ran the full meta-workflow: harvest (verified-taxonomy fetch +
incumbent inventory as a regression checklist) → editor-signed spec → forge (content + plumbing,
disjoint files) → 3-lens adversarial verification → solo fixes. Append on any future reforge;
never overwrite.

## Fleet summary

Harvest: 2 agents (primary-source taxonomy with URLs/PDFs; complete incumbent inventory — every
token, regex, rule, name-reference site). Forge: 2 agents. Verify: 3 lenses (preservation diff /
rename completeness / reframe quality + gates), refutation-framed, read-only.

## Findings

| Severity | Lens | Finding | Resolution |
|---|---|---|---|
| major | reframe | The skill's own terminology table claimed "every house term" while six load-bearing terms (false unity, titles-only test, claim-theater, pendulum, stakes-without-claim, worker-side duty) lived outside it — the skill failing its own C7 standard | Six rows added; "every" is now true |
| major | reframe | No F3 artifact (findings ledger + fire/no-fire set) shipped with the reforge | THIS file + the fire/no-fire set below; build-order verify extended |
| minor | reframe | "packaging" mislabeled *anchored* (it is a house umbrella over Orwell's vices, i.e. *derived*) | Status cell corrected |
| minor | reframe | C8 header dropped the established half of the theater anchor (Grice QUALITY/QUANTITY, Orwell meaningless words cover the token family; only the agent-failure taxonomy + machine fingerprint are novel) | Split stated in C8 |
| minor | reframe | Sibling cuts untyped on this side (forging-skills side carried PURPOSE; this side prose-only) | Three PURPOSE cuts typed in the scope paragraph |
| minor | reframe | SKILL.md over the ~230-line target via duplicated Grice/G&S quote blocks (arguing home is patterns.md) | Quote blocks compressed to named anchors + pointers |
| minor | reframe | "Claim-theater and mis-calibration" section missing from the patterns.md Contents | TOC entry added |
| minor | preservation | Flagger JSON schema altered: violation slot now "named class (C1–C8)", `unchecked_risk` field added | Deliberate (five-slot unification per the editor-signed spec) — no change |
| minor | rename | One old-name occurrence outside the hook's back-compat alternate: the lineage note quotes the former name as provenance | Deliberate — backticked provenance, stripped by the gates' inline-code exemption |

Preservation regression test: PASSED — all C1–C8 tokens (both SKILL.md and patterns.md variants,
incl. 殺す/moat/好例/この実務の執念から/通過/正直な到達点), the portable regex appendix
byte-for-byte, both shell scripts' detection regexes, all seven calibration rules, the
non-negotiables incl. the repair-spiral wording, and the six declared-novel items verified present
by the preservation lens against the incumbent inventory.

## 2026-07-03 reforge #2 — field-failure postmortem (v2607.3.0)

Trigger: an external-audience (外賓) portfolio one-pager shipped saturated with insider coinage
(~30 terms: agnostic/aware, menu 跳躍, cell, receipt:, R2607_XXX ledger IDs, verdict enums) and
this skill's own audit grammar — while satisfying the v2607.2.0 LAW verbatim. Postmortem findings,
each resolved in this version:

| Severity | Finding (design defect, not execution lapse) | Resolution |
|---|---|---|
| critical | LAW's "shared taxonomy" left the reader unbound — a document grounded ONLY in the authoring project's ledger passed the LAW | LAW re-anchored to the DECLARED READER; Reader corollary; AUDIENCE check (reader/holds/register) runs before everything |
| critical | The skill's own audit register (receipt:, gated, bounded-PASS, verdict enums) had no containment rule and leaked into the deliverable as "diligent" style | C9 (insider register export) + Register containment in Report discipline + mapping table in patterns.md |
| major | Trigger surface was audit-only ("reviewing or rewriting"); nothing fired at generation time | Write-time protocol (5 steps, audience line first); description gains BEFORE-writing + 外賓/社外/顧客 triggers |
| major | Terminology-table mandate read as a coinage license — no audience-relative cap | Term budget: ≤3 define-at-first-use terms per page-equivalent, external register; budget bound argued in patterns.md |
| major | Machine gate instance-overfit to a prior project's tokens; same-class novel coinage passed green | `--external` C9 pattern set added to `check-prose-grounding.sh` (proven: 3 QOED-style lines FAIL, clean text passes, old tokens regression-free); protocol step 5 states the grep's overfit explicitly and mandates the judgment pass |

Known residual: house dichotomies (`agnostic`/`aware`-style) are not greppable — C9 detection for
them is judgment-pass only (heuristic stated in patterns.md C9). The gate remains necessary, not
sufficient.

## Fire / no-fire set (re-run as a desk-check after any description edit)

| # | Ask | Expected |
|---|---|---|
| F1 | 「このアブストの LLMっぽい表現を直して」 | FIRE |
| F2 | "prose audit of this proposal" | FIRE |
| F3 | 「スライドタイトルが tooling-first になってないか見て」 | FIRE |
| F4 | 「この報告書、造語が多くて読めない — 用語を揃えて」 | FIRE (C7 / terminology table) |
| F5 | "the claim in this rebuttal feels overclaimed — calibrate it" | FIRE |
| F6 | 「監査レポートが PASS を連発してる、直して」 | FIRE (C8; the Stop hook co-enforces) |
| F7 | 「外賓向けの1枚資料を作って」(before any drafting) | FIRE (write-time protocol: audience line + term budget first) |
| F8 | "draft the executive summary for the customer deck" | FIRE (generation-time; external register) |
| F9 | 「この資料、内輪用語だらけで外部に出せない」 | FIRE (C9 insider register export) |
| N1 | 「このスライド、順番がおかしい」 | NO-FIRE → designing-presentations (structure) |
| N2 | "add a lint gate so this never happens again" | NO-FIRE → operating-the-harness (machine check) |
| N3 | 「この SKILL.md の description を直して」 | NO-FIRE → forging-skills (model-facing prose) |
| N4 | "survey these 30 papers on prose style" | NO-FIRE → systematizing-knowledge (corpus) |
| N5 | 「この段落の数学的内容が正しいか確認して」 | NO-FIRE (technical content; prose-only ⇒ no truth verdict) |
| N6 | fixing a typo in one sentence | NO-FIRE (no ceremony) |
| N7 | 「社内向け作業ログに receipt と verdict enum を書いて」 | NO-FIRE for C9 (internal register is the audit grammar's home; other checks may still apply) |
