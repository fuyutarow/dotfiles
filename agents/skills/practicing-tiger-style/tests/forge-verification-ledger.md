# Forge verification ledger — `practicing-tiger-style`

> Status vocabulary: `PASS`, `FAIL`, `WARN`, `NOT-RUN`. `NOT-RUN` is never evidence of PASS.

## Version, scope, and source pointers

| Field | Value |
|---|---|
| Forge version / verification epoch | v2608.1.2 / 2026-08-04 |
| Signed architecture | `.agent-state/tasks/forging-tiger-style-skill/spec/skill-spec.md` (canonical SHA256 `33de1316fef2212db6c5653bc51650e383f894496cd7a8852b8a258da770f444`) |
| Rule grades/regimes | `../references/source-ledger.md` — SOLE grade owner |
| No direct LLM-effect limit | `../references/evidence-and-limits.md` |
| Ledger/exceptions | `../references/ledger-and-calibration.md` |
| R&D/Rust/Julia calibration | `../references/rd-and-language-translation.md` |
| Execution evidence boundary | `../references/execution-model.md` |

## Atomic build order

Run from `agents/skills/practicing-tiger-style` after all files exist:

```bash
for f in SKILL.md agents/openai.yaml references/source-ledger.md references/evidence-and-limits.md references/ledger-and-calibration.md references/rd-and-language-translation.md references/execution-model.md tests/triggers.md tests/forge-verification-ledger.md; do test -f "$f" || echo "MISSING $f"; done; test ! -e scripts/tiger-check.ts || echo UNAPPROVED-FLOOR-SCRIPT; bun ../forging-skills/scripts/skill-check.ts .
```

Target-specific regex checker decision: **none**. Tier choice, meaningful bounds/negative cases,
valid exceptions, and independent oracles are semantic; a regex would reward gaming. Reuse generic
`skill-check.ts`.

## SPEC-DEVIATION

| Item | Signed-spec form | Shipped form | Reason and check |
|---|---|---|---|
| Build-order floor path | `bun ../../forging-skills/scripts/skill-check.ts .` | `bun ../forging-skills/scripts/skill-check.ts .` | From the declared target cwd, the signed path exited 1 with `Module not found`; the shipped sibling path resolves and is re-run below. |
| Unconditional Tiger-first order | Signed “CO-FIRE FIRST” framing | Phase-sensitive order in target and `implementing-and-debugging` | Bug/root-cause diagnosis remains with `implementing-and-debugging`; independent report locator `audit/heldout-delta.md`, digest `6f80e13a3a68cc971cd5121a7ac73d90c8b3d7d302cb799ed6c7f99782c93950` (not read). |

## F1 / F2 / F3 plan and results

| Gate | Planned evidence | Result | Raw locus / notes |
|---|---|---|---|
| F1 operationality | Generic floor + review that each retained rule changes an action and names artifact/gate/pointer. | PASS with waiver | Generic floor reports 23 long prose sentences. See PD-1. |
| F2 placement | Check function map/sole homes and actual sibling cuts, including authorized deferrals. | PASS | Held-out full audit PASS: `.agent-state/tasks/forging-tiger-style-skill/audit/heldout-final.md`, SHA256 `4c94420790d49ec94f756f6a8a36eabc0b79be61a6aa717914ea3ebb61dbd310`, candidate `40716d363e9c4fe4bd09f83c01be4aafd9e9ab86f4a787b724537e1d1d8dee0e`. |
| F3 self-verification | Desk-check all trigger rows; run floor; resolve hostile findings; live-eval contested rows only. | PASS | Held-out full audit PASS (8/8 fire, 8/8 near-miss, 4/4 co-fire) plus final exact-prompt fresh contexts forward6a `ac8abe231fa88e5d8a23a957694f3fd8be826d59aa293acb226e7daa091ca223` and forward6d `f1e46707e8fcddb868ad8625b658fc809fb271e3ebe8cfb1ba3b9ba7e883d1d8`, both exact 8 columns/5 rows/receipt before advice. |

## Mechanical and metadata checks

| Check | Command / method | Result | Observation |
|---|---|---|---|
| Generic floor | `bun ../forging-skills/scripts/skill-check.ts .` | PASS with waiver | Exit 0; 23 prose sentences >120 chars. |
| YAML quick validation | `uv run --with pyyaml --no-project python /home/fuyu/.codex/skills/.system/skill-creator/scripts/quick_validate.py agents/skills/practicing-tiger-style` | PASS | `Skill is valid!` (exit 0). |
| Description parse/count | Parse final `SKILL.md` YAML description, record exact count and ≤1024 compliance. | PASS | `name=practicing-tiger-style`; 983 characters; `True` for ≤1024. Metadata values remain valid. |
| Trigger desk-check | Read name + description only against F1–F10, N1–N9, C1–C6. | PASS | All 25 rows recorded PASS in `tests/triggers.md`; no contested ID. |
| Forbidden checker | `test ! -e scripts/tiger-check.ts` | PASS | Atomic command emitted no `UNAPPROVED-FLOOR-SCRIPT`. |

## Sibling cuts and forward-test evidence

| Surface | Required evidence | Result |
|---|---|---|
| `implementing-and-debugging`, `refactoring-code`, `writing-rust`, `writing-julia`, `orchestrating-agents`, `forging-skills`, `acting-on-hypotheses` | Actual reciprocal cut or recorded authorized deferral; C1–C6 show no race/void. | PASS, held-out full audit scope: all placement/co-fire rows; candidate digest `40716d363e9c4fe4bd09f83c01be4aafd9e9ab86f4a787b724537e1d1d8dee0e`. |
| Platform owners | GPU/Workers/Sui catalogues are pointers, not duplicated. | PASS; target routes platform-specific mechanisms to their owners and preserves P7 admission ownership. |
| Fresh-context forward test | User-like prompts, required artifacts only, no diagnoses; compare baseline if one exists. | PASS, final exact-prompt contexts: forward6a `ac8abe231fa88e5d8a23a957694f3fd8be826d59aa293acb226e7daa091ca223`; forward6d `f1e46707e8fcddb868ad8625b658fc809fb271e3ebe8cfb1ba3b9ba7e883d1d8`; both emitted exact 8 columns, 5 rows, and matching receipt before advice. Prior `forward/comparison.md` evidence remains historical only. |
| No-direct-effect scan | Inspect release prose for TigerStyle-causes-LLM-safety/speed/correctness claims. | PASS; target and references state the no-direct-evidence limit and make no effect promise. |

## Prose debt and findings resolution

| ID | Class / finding locus | Earliest reopened gate | Resolution or waiver | Status |
|---|---|---|---|---|
| PD-1 | Generic floor: 23 prose sentences >120 chars. | F1 | **PROSE-DEBT waiver (2026-08-04):** SOURCE CLAIM CHECK interface is frozen; retire at the next target reforge by atomizing the 23 sentences without duplicating one-home rules. | WARN |
| FR-1 | Known-bad isolated copy used `name: invalid_name`. | F3 | Generic floor exited 1 for basename mismatch and invalid underscore name; temporary copy removed with `rip`. | PASS |
| FR-2 | Prior digest-bound red test. | F3 | Superseded by FR-3 after the v2608.1.1 `SKILL.md` edit; not current evidence. | PASS |
| FR-3 | Prior digest-bound red test. | F3 | Superseded by FR-4 after the v2608.1.2 `SKILL.md` edit; not current evidence. | PASS |
| FR-4 | Current digest-bound red test; clean `SKILL.md` SHA256 `f5a9470399748535b616fcd4b98f228a6719bcc525f64e77e33049ff115152fd`; basename `practicing-tiger-style`. | F3 | Injected SHA256 `04d1529ca1716b0a8316a04189b19bebbc9f6f0b48ff7b23843541dbb3efb443`; `bun agents/skills/forging-skills/scripts/skill-check.ts /tmp/practicing-tiger-style-red4.SGJR7S` emitted two invalid-name FAILs, exit 1. `rip` cleanup exit 0; absence exit 0. Clean rerun emitted `WARN … 23 prose sentences`, exit 0. | PASS |

## Independent acceptance

The held-out full audit PASS is `.agent-state/tasks/forging-tiger-style-skill/audit/heldout-final.md`,
SHA256 `4c94420790d49ec94f756f6a8a36eabc0b79be61a6aa717914ea3ebb61dbd310`, for candidate digest
`40716d363e9c4fe4bd09f83c01be4aafd9e9ab86f4a787b724537e1d1d8dee0e`: 8/8 fire, 8/8 near-miss,
4/4 co-fire. Sonnet source-interface audit is SCOPE-LIMITED PASS at
`.agent-state/tasks/forging-tiger-style-skill/audit/sonnet-source-inline.result.md`, SHA256
`5d3de10134005a03e263f217f54806778e750877828cfdb70e80a7b7f5c4517c`.

It reports nonblocking source-local supported-versus-partial variance; safe portability
dispositions agree. The separate Sonnet placement call timed out with zero output: **NO VERDICT**,
not a pass and not counted as evidence.

## Reciprocal waiver pointers

The reciprocal cuts are the only edits to their sibling SKILL.md files. Their dated 2026-08-03
waivers and observed floor counts are recorded in:

- `../../implementing-and-debugging/tests/forge-verification-ledger.md`
- `../../refactoring-code/tests/forge-verification-ledger.md`
- `../../writing-rust/tests/forge-verification-ledger.md`
- `../../writing-julia/tests/forge-verification-ledger.md`
- `../../orchestrating-agents/tests/forge-verification-ledger.md`
- `../../forging-skills/tests/forge-verification-ledger.md`

## Staleness and reforge triggers

Re-audit before revision if a source fact ages beyond its verification date, TigerStyle or official
language/tool guidance changes, a sibling cut changes, harness capabilities change, an observed
failure escapes this skill, an exception/risk regime changes, or prose-debt warnings grow. Re-run
the affected F1/F2/F3 rows; never promote `NOT-RUN` to PASS without its raw observed artifact.
