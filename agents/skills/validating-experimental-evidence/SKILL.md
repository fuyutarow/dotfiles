---
name: validating-experimental-evidence
description: >-
  Validates benchmark evidence for claims. Use for comparison footing/比較土俵,
  baseline/基準線, leakage/ラベル漏れ, prequential tests, implausible scores, confounded
  ablations/交絡, regression/退行, registry bypass, or stale executed code.
  Owns EVIDENCE DISPOSITION meaning; polysearch owns schema and promotion gates.
  Prospective run→directing-research-sections; costly test threshold→acting-on-hypotheses;
  dispatch/resources→orchestrating-agents; risk ledger→practicing-tiger-style;
  code fix→implementing-and-debugging. Workflow-native: judgment SOLO; receipts may fan out.
  English skill; respond in the user's language.
---

# Validating experimental evidence

> **Version**: v2609.1.0 (2026-09-25) — evidence judgment; polysearch owns the record and gate.
> **Source grades and incident limits**: `tests/forge-verification-ledger.md`.

```bash
for f in registered-benchmarks footing-and-lineage controls-and-information-flow; do test -f "references/$f.md" || echo "MISSING references/$f.md"; done
test -f tests/triggers.md && test -f tests/forge-verification-ledger.md
test ! -f scripts/evidence-check.ts && test ! -f assets/evidence-disposition.example.json
```

## Language

Keep **EVIDENCE DISPOSITION**, **measurement validity**, **footing**, and
**concept eligibility** stable. Also keep **RAW ONLY**, **SCOPED**, **COMPARABLE**,
**CURRENT_REFERENCE_ONLY**, **REGRESSION**, and **gate EV0–EV4** stable.

## LAW — a score is an observation before it is evidence

> Preserve the raw run. Check its effective contract, executed revision, information
> flow, and controls. Then check footing and historical scope before a claim.
> An implausibly high score is a reason to quarantine and discriminate, not proof of success
> or proof of leakage. A failed or unknown validity check cannot be promoted by comparison.

Maximize **decision-changing valid learning per unit time**, not cards, runs, or reports.
Use the cheapest check that can change the disposition. A failed check returns a
specific repair. It does not block unrelated exploratory work.

This skill owns the *meaning* of measurement validity and comparability. It does not launch
the run, choose a research bet, allocate resources, or implement the target's gate.
In polysearch-backed research, **polysearch owns the question/hypothesis/run/finding
schema and promotion gates**. Arena owns its registered stream and scoring contract.
Do not create a sidecar card, validator, or second result store in this skill.

## Function map — one owner per artifact

| Input state | Verb | Owned artifact | Next state / stop |
|---|---|---|---|
| Proposed benchmark or experiment | Bind the target-owned contract; specify falsifying controls | validation plan and binding locators for the existing run intent | Ready for domain execution, or instrument repair |
| Raw terminal run and exact contract | Join target receipts; test validity | `EVIDENCE DISPOSITION` in the canonical finding | `PASS`, `FAIL`, or `UNKNOWN` measurement validity |
| Valid run plus comparator or historical result | Test footing, confound, and concept eligibility | comparison and claim scope in that finding | `RAW ONLY`, `SCOPED`, `COMPARABLE`, or temporal claim assessment |

`directing-research-sections` owns `RUN_INTENT`, executor `RUN_RECEIPT`, and local learning
commit. The builder-owned measurement contract cites this skill's validation plan.
It also cites the target-owned effective benchmark contract. Its validity-evidence locus cites the
canonical finding or domain evidence record. `orchestrating-agents` consumes that
locus/digest only for dispatch, visibility, and acceptance topology.

## Gates — run at the boundary that can still reject a bad claim

| Gate | Predicate and action | Checkable artifact |
|---|---|---|
| **EV0 CONTRACT** | Registered benchmark? Resolve its ID to the effective executable stream/metric contract and allowed overrides before launch. A copied parameter string is not authority. Missing target binding stops an official score; an ad hoc run may support only a clearly scoped local claim. | Registry ID, contract digest, target acceptance/rejection receipts; `registered-benchmarks.md` |
| **EV1 EXECUTED INPUT** | Join observed code, input, parameters, realized length, and final scored position to the intended run. A stale worktree, unbound registry ID, or missing scored tail returns `FAIL`/`UNKNOWN`. | Exact invocation and post-launch attestation in the canonical run/finding; `registered-benchmarks.md` |
| **EV2 INFORMATION FLOW** | If labels enter an online learner, freeze reveal order. Changing the current or future label must not change a prediction made before its reveal. Run a target-appropriate null when leakage is plausible or a score contradicts a bound. | Perturbation output and null-control locus; `controls-and-information-flow.md` |
| **EV3 FOOTING** | Compare like metric, split, stream, scoring window, training protocol, and baseline. For mechanism ablation, change only that mechanism. A confounded contrast cannot update a causal hypothesis. | Axis and confound table, same-stream baseline, bound check; `footing-and-lineage.md` |
| **EV4 LINEAGE** | Before “regression”, “recovery”, or “new ability”, classify prior and current artifacts against the concept contract, prior benchmark contract, and replacement obligation. Ineligible old leaders are oracle references; transferable mechanisms remain candidates. | Prior/current capability matrix and scoped claim; `footing-and-lineage.md` |

Apply EV0 and prospective EV2 controls before a registered run. Apply EV1–EV4 on arrival of
its raw receipt. When any required check is `FAIL` or `UNKNOWN`, preserve the number and
write the exact repair or discriminating test. Do not silently discard negative results.

## Disposition lookup — no single vague PASS

| Measurement validity | Footing | Concept / replacement relation | Allowed claim |
|---|---|---|---|
| `FAIL` or `UNKNOWN` | any | any | **RAW ONLY**: quarantine; no benchmark delta or scientific learning |
| `PASS` | different or unknown | any | **SCOPED** standalone result; describe the condition difference |
| `PASS` | any | current concept ineligible | **CURRENT_REFERENCE_ONLY**; no achievement by the current concept |
| `PASS` | any | current concept unknown | **SCOPED** result; inspect the concept contract before an achievement claim |
| `PASS` | same | current eligible; prior concept ineligible or unknown | **COMPARABLE** numerical reference; no regression/recovery claim |
| `PASS` | same | eligible prior and current artifacts, plus declared replacement obligation | **REGRESSION** or recovery may be assessed against a prewritten margin |
| `PASS` | no comparator | not applicable | **SCOPED** standalone result only |

`REGRESSION` is permission to *assess* a directional claim, not an automatic verdict.
The claim still needs actual values, uncertainty, margin, and evidence loci.
Beating a weak comparator does not establish capability if the candidate misses
its trivial baseline. A forward-only implementation is not a training-speed comparator.

## Canonical recording and verification

Record the disposition in the existing polysearch finding and its joined run,
hypothesis, candidate, and Arena contract. If polysearch cannot represent or reject
a required state, mark the result `UNKNOWN` or `INSTRUMENT_REPAIR`.
Fix its schema or launch gate there. Never claim this SKILL.md enforces a runtime rule.
In another research system, use its one canonical evidence ledger. Verify with the
target's accepted and rejected invocations plus raw output, not a parallel Bun script.

## MUST NOT FIRE and sibling cuts

| Ask | Route |
|---|---|
| “Run this standard benchmark” with no evidence question | Domain executor must still use EV0's registered launch/binding and preserve the raw receipt. Defer only the interpretation. |
| Choose a costly selected hypothesis, threshold, or Commit/Pivot/Kill | `acting-on-hypotheses`; this skill later validates the raw target result |
| Admit/register one granted section's run or commit learning | `directing-research-sections`; it consumes this disposition, never delegates its authority |
| Agent roles, write-set isolation, CPU/GPU admission, status | `orchestrating-agents`; this skill supplies validity, not a fleet |
| Decide where a prediction-time label invariant lives in a type, parser, or state API | `designing-type-contracts` after this skill states the information-flow requirement |
| Implement a benchmark adapter, runner, leak test, polysearch schema, or promotion gate | `implementing-and-debugging` plus language owner; this skill supplies the negative cases |
| Effective configuration/signature authority of a registry file | `governing-configuration-systems`; its contract can feed EV0 |
| Consequential architecture/release risk | `practicing-tiger-style`; link this disposition into T2/T4 |
| Frozen terminal research-process audit | `auditing-research-processes`; this skill can validate its measurement rows |
| Prove a theorem or judge faithfulness of its formal statement | `proving-theorems`; this skill only checks whether stated assumptions apply to a measured run |
| Research document admission, retention, or authority | `governing-research-documentation`; it governs canonical records, not this verdict |

## Reference index

| File | Covers | Read when |
|---|---|---|
| `references/registered-benchmarks.md` | EV0/EV1 target-owned benchmark binding, observed revision, generated length | Registering or accepting a benchmark run |
| `references/controls-and-information-flow.md` | EV2 reveal order, prequential perturbation, restricted-label null, outlier quarantine | Labels/feedback touch prediction, or a score exceeds a credible bound |
| `references/footing-and-lineage.md` | EV3/EV4 comparison axes, confound table, same-stream baselines, historical capability classes | Comparing runs, mechanism ablations, regression/recovery claims |
| `tests/triggers.md` | Fire/no-fire and co-fire desk-check | Editing description or sibling cuts |
| `tests/forge-verification-ledger.md` | Source grades, bounded postmortem, verification and waiver | Reforge or audit |
