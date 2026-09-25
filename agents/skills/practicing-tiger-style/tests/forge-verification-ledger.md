# Forge verification ledger — `practicing-tiger-style`

## 2026-09-23 — architecture through implementation, v2609.1.0

This section governs the current reforge. Earlier PASS records below are historical only.
Incumbent: dotfiles commit `d2caa63142818c80c98c74c58827864a34c2ecb1`.
Editor: root Codex session. Read-only reviewers use separate Terra contexts.

### Signed function map and file treatments

```text
workload + current/proposed design
  → select consequential architecture constraints
  → one Tiger conformance ledger with design-to-check links
  → implementation handoff or scoped review findings
```

The editor owns this map, wording, fixes, and acceptance.
Delegated review cannot edit files, choose architecture, or certify empirical effects.

| File | Treatment / sole responsibility |
|---|---|
| SKILL.md | Rewrite around entry points and T0–T4; keep phase-sensitive sibling cuts |
| architecture-decisions.md | New T0 decision map and constructed paid-job example |
| ledger-and-calibration.md | T1–T4; link design IDs, separate planned checks from observed results |
| source-ledger.md | SoK identity/commit, source grades, preserved official-rule output contract |
| evidence-and-limits.md | Bounded evidence interpretation; retire unverified adjacent LLM claims as active premises |
| rd-and-language-translation.md | Stage transition and owner handoff; remove duplicated language/tool guidance |
| execution-model.md | Solo design and acceptance, optional read-only fact returns |
| agents/openai.yaml | Architecture-and-code display description and default prompt |
| tests/triggers.md | Current routing and behavioral regression cases |

### Calibration and provenance

| Dimension | Source audience | Agent consumer / corrective rule |
|---|---|---|
| Failure direction | Systems engineers must anticipate capacity and failure paths | Same omission: inspect whole-path state, resources, and recovery before assertions |
| Overcorrection | Database choices fit a particular workload | Inverse risk: avoid transplanting single-threading or startup allocation universally |
| Timing | Design choices precede code | Permit estimated T0, while keeping implementation checks unrun |
| Acceptance | System behavior needs evidence | Distinguish DESIGN-READY from PASS; command text is not an observation |

Scientific synthesis stays in the SoK identified in `references/source-ledger.md`.
T0 and its schema are skill-supplied operationalization, not newly discovered scientific results.
This reforge uses the existing corpus; it performs no new external-primary-source survey.
The earlier corpus's draft status and reading-depth claims are not promoted to independent certification.

### Incumbent comparison — textual inspection

| Cases | Incumbent affordance | Revised affordance |
|---|---|---|
| B1 | Consequence gate precedes obligations; no explicit pre-code architecture output | T0 accepts estimates; DESIGN-READY carries planned checks |
| B2 | Per-row bounds, no explicit cross-component retry trace | Follow admission through recovery; account for displaced queues |
| B3 | Source-local portability guard | Explicit distinction between ordered state updates and concurrent I/O |
| B5 | Generic duplicate-apply negatives | Concrete external-effect boundary beyond lease fencing |
| B6 | Inline eight-column source claim gate | Same gate in a mandatory-on-claim reference |
| B9 | Command/result language could be read as accepting a runnable command alone | Explicit check status; command alone remains planned |

These are differences in instructions, not measured improvement in model performance.

### Findings and current verification

| Check / finding | Result | Evidence or clearing condition |
|---|---|---|
| Target floor | PASS | `bun agents/skills/forging-skills/scripts/skill-check.ts agents/skills/practicing-tiger-style`; exit 0, no warnings |
| F1 prose debt | CLEARED | Baseline: 23 long core sentences and 40 in references; current floor emits none |
| Collection F4 | PASS with unrelated warnings | `mise run lint:skills-floor`; exit 0, 71 skills / 65,130 listing chars, 111 warnings across 59 other skills |
| Whitespace | PASS | `git diff --check`; exit 0 |
| Reviewer: acceptance ledger retained old epoch | FIXED | This section supersedes historical acceptance; new trigger and behavior cases recorded separately |
| Reviewer: EOF blank lines | FIXED | Whitespace check above |
| Initial architecture review | SCOPE-LIMITED PASS | `/root/tiger_review`: T0, portability, source gate, planned-check boundaries inspected |
| Final routing/content review | SCOPE-LIMITED PASS | `/root/tiger_review`: F1–F8, N1–N9, C1–C5 agree after N1/N9 repair; final F1/F6/C1 rechecked |
| Fresh-context exercise | SCOPE-LIMITED PASS | `/root/tiger_forward`; B1/B2/B3/B5/B9 observed in one combined design exercise |
| Installed file links | PASS | `mise run link:skills`; Claude and Codex skill paths resolve to this directory |
| Live installed trigger benchmark | NOT-RUN | Desk-check and explicit invocation do not establish automatic trigger reliability |

The old source-interface live tests below do not certify the moved interface on this version.
No causal effectiveness or exhaustive architecture-coverage claim is made.

### Fresh-context design exercise — raw prompt and observations

The worker read the current skill and relevant references, but not the tests or this ledger.
It had no prior conversation and performed no file writes or external research.

> Tiger Styleで永続課金job queueのアーキテクチャを設計して。コードはまだなく、ピーク到着率も未計測。
> workerが外部providerへ課金を送った直後に落ちることがある。providerは冪等キーを保証しない。
> 並行I/Oで速くしたい。各workerのqueueは100件上限だが、失敗分はAPI側の無制限listに戻している。
> 今わかる範囲で設計と検証の次の一手まで出して。

The returned artifact contained a durable job owner, lease generation, provider adapter, and reconciliation path.
Its five obligation rows were all marked `planned`.
It separated state-update ordering from bounded parallel provider I/O.

Selected verbatim answer excerpts:

> 失敗を API の無制限 list に戻す現状は、上限を上流へ移しただけでメモリ・DB・再試行嵐を無制限化する。

> provider に冪等キーがない以上、この状態を自動再送してはならない。再送は二重課金になり得る。

> 現段階の判定は **DESIGN-READY** であり、実装・信頼性・容量の **PASS ではありません**。

This single exercise supports the intended output distinctions only.
It does not verify a payment implementation, compare against an executed baseline, or test B6's source interface.
B6 remains a textual contract check on this version, not a new live-interface PASS.

### Accepted candidate

Editor accepted the bounded skill revision after the final read-only review.
Current core SHA-256: `4c3a5261daf9bc4fc7574ca8e1035d143a0342aaba223132a7a3586eaf2d9c62`.
T0 reference SHA-256: `47da78b857981ac459bdb544be19b8b1d5376dfefa6d12e9fcec0ab0f0c8a376`.
The old F1 prose-debt waivers are retired for this candidate: target floor has no warnings.
An installed path check is not evidence of fresh-session automatic invocation.

## 2026-09-10 — reciprocal configuration seam / PROSE-DEBT waiver

One routing row names the seam between risk-ledger decisions and configuration representation.
Existing prose/reference debt remains pre-existing. Queue: next practicing-tiger-style reforge.

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

## Reforge v2609.2.0 (2026-09-25) — performance cost and semantic preservation

**Function and cut.** Consequential workload/design plus a material performance objective
`→` T0 cost model and two T2 obligations `→` T4 observed speed and semantic checks
`→` scoped acceptance or STOP. The platform owner derives device-specific work and
measures it. `implementing-and-debugging` owns the change; Tiger owns the consequential
contract linking design, bound, oracle, and acceptance.

**Source grade.** The user-supplied Firefly postmortem reports that revisions were ordered
for correctness without a work estimate or throughput gate. Its later GPU revision
predeclared a speed floor and bitwise prediction agreement. This is a dated source report,
not a reproduced runtime result here. The T0/T4 linkage is skill-supplied generalization.
No Firefly speed target or exact bitwise requirement becomes a universal rule.

**Calibration.** The observed model failure was to accept correct output as completion
while the consequential speed objective remained untested. T0 now requires a scoped cost
model when performance is material, and T4 keeps speed and semantics as separate checks.

**F2/F3 desk-check.** F9 and B11 exercise a costly performance revision; N10 keeps a
throwaway benchmark with the domain executor. Existing F2 and C1–C4 cuts remain: root
cause first with `implementing-and-debugging`, GPU mechanics with the platform skill.
Fresh-context task success and runtime gains are NOT-RUN for this documentation reforge.

**Comparative judge.** Against HEAD, the old T2/T4 shape could close a material
performance revision after a throughput observation if output preservation was not
explicitly registered. The revised T0 cost row and paired T2/T4 checks require both
speed and declared semantics on the same workload. The throwaway benchmark remains
outside this ledger. The judge found no route regression for the consequential case.

**Verification receipt.** `quick_validate.py`: PASS. Target `skill-check.ts`: exit 0,
0 FAIL, 0 prose WARN. `git diff --check`: PASS. Collection floor passed at
72 skills and 64,564 listing characters. `mise run link:skills` passed; the
Claude skill link resolves to this source directory.

## Reforge v2609.3.0 (2026-09-25) — consume canonical benchmark evidence

Tiger still owns a consequential design's cost, semantic-preservation,
negative-case, and acceptance rows. Experimental-score validity, label leakage,
footing, and historical regression now belong to
`validating-experimental-evidence`. A T4 performance observation cites its
canonical polysearch finding/disposition; a quarantined or incomparable score
cannot close the row. No benchmark schema or alternative validator is authored
here. This split follows the user's polysearch-only correction.

Target `skill-check.ts` exited 0 with 0 FAIL/0 WARN. Its existing trigger set
adds C6 for the ordered co-fire. No runtime effect is claimed from this edit.
