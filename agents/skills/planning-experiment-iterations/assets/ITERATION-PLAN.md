# ITERATION_PLAN and ITERATION_LOG

Embed these fields in the project's canonical run intent/finding. Do not create a second store.
Freeze before launch. A changed binding or criterion gets a new ID linked to the old one.
Use `NOT-APPLICABLE (<reason>)` for conditional fields; an empty placeholder is not readiness.

```text
ITERATION: <id>
FROM_EVIDENCE: <prior log/record; first iteration: source + unresolved question>
DECISION: <choice this result can change>
KIND: DIAGNOSTIC | MECHANISM | CONFIRMATION
READINESS: <prerequisite -> PASS/FAIL/UNKNOWN + receipt; diagnostic names what it can close>
BINDING: <code/config/data fingerprints; runner/adapter; reveal/reset order; scored window>
RIVALS: <H1, H2; may coexist; diagnostic: expected invariant vs observed violation>
PREDICTIONS: <same observable under each rival + auxiliary assumptions>
ORACLE: <exact output | achievable reference | upper/lower bound | heuristic; value + locator>
ORACLE_SCOPE: <inputs available; family/depth; resets; scoring; bound direction; margin derivation>
  or NONE: <why not applicable/computable and which claim is unavailable>
BASELINE: <same-stream arm, expected range, sanity receipt>
CONTROL: <validity and mechanism controls; matched capacity if relevant>
CRITERION: <absolute/relative criteria with justified uncertainty; promotion prerequisites>
OUTCOMES: <use table below; include invalid/inconclusive/cap-hit branches>
SCALE_BASIS: <smallest n/K/family separating predictions; preserve required mechanism/depth>
PHASE_COSTS: <queue, CPU reference, compile, transfer, kernel, record/teardown; measured or unknown>
TARGET_WALL_S: <default about 120; basis>
CAP_S: <default 600; exception: prelaunch owner approval + reason; obey task limit; no mid-run increase>
DEVICE: GPU | CPU
DEVICE_REASON: <cost/dependency; required for CPU; obey task device constraints>
PLANNED: RAM <GiB>, VRAM <GiB>; <per-case and total caps for any warm process>
OWNER: <main or agent; unique launch owner>
ADMISSION: <required section/resource owner authorization receipts; a filled plan is not authorization>
ENVELOPE: <resource-owner admission locator; N/A only for noncompute work>
DEADLINE: <time + zone; launch/return deadline>
STOP_IF: <cap/breach/failed prerequisite; stop and release action>
HAND_BACK: <terminal receipt, blocked prerequisite, or deadline; allowed next conditional branch>
```

| Result region | Required assumptions/controls | Scoped exclusion (or none) | Next action |
|---|---|---|---|
| <discriminating region> | <receipts required> | <exact proposition> | <next decision> |
| Overlap / inconclusive | <uncertainty or missing discriminator> | None | <cheapest resolving check> |
| Validity check failed | <failed check> | No mechanism exclusion | <instrument diagnosis> |
| Timeout / breach | <terminal receipt> | No scientific exclusion | <cost/resource diagnosis> |

```text
LOG: <iteration id + frozen plan locator>
EXECUTED_BINDING: <observed fingerprints and invocation>
JOB: <job id; dispatched/admitted/running/terminal with receipt>
RESULT: <raw observations + locator, including partial or failed output>
EVIDENCE_DISPOSITION: <canonical validation verdict locator + scope>
OUTCOME_ROW: <frozen row matched, or INCONCLUSIVE; never retrofit>
VERDICT: <exact exclusion / localization / none; assumptions checked>
UNEXPLAINED: <coexisting causes, untested positions, missing assumptions>
PHASE_ACTUAL: <observed phase times; distinguish estimate from measurement>
PEAK: RAM <GiB>, VRAM <GiB>
RELEASED: <time + receipt>
NEXT: <next decision/conditional plan or STOP; cite this log>
```
