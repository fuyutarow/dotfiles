# Bounded postmortem — firedancer reports, 2026-09-27

## Evidence boundary

- AUDIT_ID: planning-iterations-20260927
- EPISODE_ID: firedancer-agt_eraw-reports-0900-1020
- EPISODE_STATUS: NOT-EVIDENCED as terminal; admitted as an explicitly bounded historical excerpt.
- AUDITOR_INSTANCE_ID: codex-ac1c61c6aaf5c510 (current task, not the report author).
- EPISODE_AUTHOR_INSTANCE_ID: firedancer-agt_eraw (attachment header).
- PROGRAMME_SUPERVISOR_INSTANCE_ID / SECTION_DIRECTOR_INSTANCE_ID: NOT-EVIDENCED.
- EVIDENCE_PACKET_LOCUS: user-supplied `Pasted text.txt`, attachment `3fb2e418-919c-4a10-bf7a-b98b79f35451`.
- EVIDENCE_PACKET_SHA256: `e48513501f738ff18b3ca60f5a5ff6fef836c7c23bfa5543bb9ff5f7f288697b`.
- Scope: all 1,739 lines, header plus 50 reported turns, 09:00–10:20 JST.
- AUDITABILITY: UNAUDITABLE for complete execution/process causality; report-level reasoning is inspectable.
- DECLARED_DENOMINATOR / TERMINAL_RECEIPT_COVERAGE: NOT-EVIDENCED.
- Input evidence is unchanged. This audit contains bounded summaries and line locators, not a transcript copy.

The attachment is a sequence of outward reports. It supplies no raw tool receipts, code snapshot,
full user instructions, or complete run denominator. Reported scores and fixes are not independently
reproduced here. A report's self-diagnosis is an assertion to test, not an established cause.
The current auditor is distinct from the named author; full programme-role independence is not evidenced.
No live research state is changed. Skill repair is separately authorized by the current user.

## Findings

| Lens | Verdict | Evidence locus in attachment | Bounded finding | Limitation |
|---|---|---|---|---|
| frame-problem-coevolution | EVIDENCED | L1080–1091, L1158–1173 | Reports corrected the proposed novelty and distinguished revealed-state input from a hidden-state task | Does not establish the cited theoretical results or complete search coverage |
| generation-evaluation-separation | NOT-EVIDENCED | L1093–1142 | Rival tables exist, but independent frozen candidate/run timing is unavailable | No claim about actual preregistration integrity |
| terminal-denominator | NOT-EVIDENCED | L1180–1188; packet boundary L1739 | Some stopped runs are reported; a full denominator is absent | Overall process remains UNAUDITABLE |
| premise-alternative-breadth | VIOLATED | L1590–1648 | Alternatives were written, but path differences were used to discard potentially coexisting defects; another model's success was generalized to runner correctness | This assesses the stated inference, not the actual faulty component |
| discriminating-action | VIOLATED | L528–529, L1183–1197, L1626–1648 | Outcome criteria did not reliably govern interpretation or scale promotion; a two-sided control was recast as harmless improvement | The reported numbers are not raw measurements |
| surprise-uptake | VIOLATED | L504, L714, L1071, L1462–1463 | A limited perturbation was reported as no leakage, then its missing current-label case was acknowledged; a low score was first called a CPU defect, then an expected depth limitation | Later correction is visible; general causal correctness is not established |
| audit-independence | NOT-EVIDENCED | L1 and this audit's actor metadata | Author/auditor labels differ; complete actor provenance is absent | No independent-reproduction claim |
| negative-result-retention | EVIDENCED | L1185, L1352–1367, L1462–1465 | Timeout, oracle mismatch, and retracted diagnoses remain visible | Retention completeness cannot be assessed |

## Failure → rule defect → repair

| Observed report-level failure | Existing skill defect or execution gap | Distilled change |
|---|---|---|
| ON 0.201 / OFF 0.018 passed a +0.10 criterion, despite the claimed reference 0.226; a larger run followed and timed out (L1183–1197) | I4 froze a comparator's name/value but required no readiness or absolute-performance condition | I0 readiness; diagnose a suspect baseline before dependent mechanism or scale claims |
| The control criterion was within 0.02; +0.064 was reported as no harm (L529, L1184, L1522–1525) | A pass/fail field did not preserve the meaning of a two-sided control | Outcome table binds result regions; an unexpected beneficial effect still violates a no-effect prediction |
| Occupancy was promoted from a data-only number to a learner lower bound; omitted gates/aggregation/composition later explained a mismatch (L1352–1367, L1686) | I2 treated all oracles/ceilings as one type | Preserve bound direction, information access, family, depth, reset, scoring, and regret assumptions |
| Another model scored 0.176; the report concluded runner alignment was correct and PG defective (L1602, L1646–1650) | “Maximize hypotheses eliminated” rewarded an overbroad exclusion | Exclude only the universal-failure proposition; preserve model-specific runner/adapter interactions |
| CPU/GPU differences led to successive confident cause claims; a current-label perturbation was initially omitted (L714, L799–809, L1071, L1462) | I1 lacked auxiliary assumptions, coexistence, validity-failure and inconclusive branches | Separate localization from cause; bind perturbation coverage; validate before eliminating |
| Four GPU slots were occupied mainly by CPU reference work and compilation (L1382–1385) | Device table explicitly prescribed one arena per job, as many as VRAM admitted | Phase-cost plan; smallest useful witness; consider reusable references and bounded warm-process execution |
| GPU jobs were launched by main while agents also owned queues; duplicate slots/locks blocked starts (L1216–1238, L1386–1456) | Plan fields did not distinguish dispatch from running or require ownership reconciliation | Job/phase receipts; reconcile launches before takeover |
| CPU reference moved to REV8 while the port still targeted REV5 (L1528) | Freeze did not explicitly bind executed code and reusable reference fingerprints | Pin and attest code/config/data; old evidence retains old scope |
| Existing theory was rediscovered and then corrected (L1082) | FROM_EVIDENCE existed but had no explicit retrieval decision | I0 prior-result retrieval before novelty or repetition claims |
| Reports repeatedly used activity/occupancy to justify expansion (L879–880, L1017–1041) | The skill inherited the episode author's utilization remedy | Optimize the next valid decision; idle is permissible when no independent admissible check exists |

The bounded root finding is a **planning-contract defect**: the old template captured a test's
shape without capturing the conditions that make its result interpretable. The source also shows
noncompliance with existing minimal-first and prerequisite rules. Merely repeating “GPU first”,
adding a ledger, or asking for more hypotheses would preserve both failure modes.

This is not a finding that CPU reference accuracy must always exceed an occupancy number.
That conclusion requires a matched achievable guarantee and finite-sample assumptions. Nor does the
snapshot establish that every diagnostic suite was wasted, that every CPU exception was wrong,
or that all reported idle periods should have been filled.

## Typed recommendations — non-enacting

| Type | Recipient with decision authority | Evidence basis | Proposal |
|---|---|---|---|
| PROCESS_REPAIR | Owner of planning-experiment-iterations | Rows above; current v2609.1.0 text | Replace elimination-count/utilization incentives with readiness and outcome-scoped decisions |
| EVIDENCE_RECOVERY | Research episode's evidence owner | Missing raw receipts and denominator | Reconcile original bindings, controls, stops, and dispositions before any scientific reanalysis |

AUTHORITY: RECOMMENDATION_ONLY
RAW_SECTION_CONTENT_INCLUDED: NO

No programme transition, run, or research claim follows from this audit. The user-authorized
skill edit is recorded separately in `forge-verification-ledger.md`.
