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

## Fire / no-fire set (re-run as a desk-check after any description edit)

| # | Ask | Expected |
|---|---|---|
| F1 | 「このアブストの LLMっぽい表現を直して」 | FIRE |
| F2 | "prose audit of this proposal" | FIRE |
| F3 | 「スライドタイトルが tooling-first になってないか見て」 | FIRE |
| F4 | 「この報告書、造語が多くて読めない — 用語を揃えて」 | FIRE (C7 / terminology table) |
| F5 | "the claim in this rebuttal feels overclaimed — calibrate it" | FIRE |
| F6 | 「監査レポートが PASS を連発してる、直して」 | FIRE (C8; the Stop hook co-enforces) |
| N1 | 「このスライド、順番がおかしい」 | NO-FIRE → designing-presentations (structure) |
| N2 | "add a lint gate so this never happens again" | NO-FIRE → operating-the-harness (machine check) |
| N3 | 「この SKILL.md の description を直して」 | NO-FIRE → forging-skills (model-facing prose) |
| N4 | "survey these 30 papers on prose style" | NO-FIRE → systematizing-knowledge (corpus) |
| N5 | 「この段落の数学的内容が正しいか確認して」 | NO-FIRE (technical content; prose-only ⇒ no truth verdict) |
| N6 | fixing a typo in one sentence | NO-FIRE (no ceremony) |
