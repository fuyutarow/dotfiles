# ITERATION_PLAN row and ITERATION_LOG entry

Copy one block per iteration. Fill every field before launch; `<…>` left in place means the gate did not pass.

```text
ITERATION: <project id, e.g. iter2609-closure-smoke-a5>
FROM_EVIDENCE: <ITERATION_LOG entry or record id this row follows from>
RIVALS: H1 <…>; H2 <…>
PREDICTIONS: H1 → <observable = value>; H2 → <observable = value>
ORACLE: <data-only value + locator> | NONE (<why not computable>)
SCALE_BASIS: <smallest n/K/family where the predictions separate by more than the margin>
TARGET_WALL_S: <≈120>
CAP_S: 600
BASELINE: <arm and value>
CONTROL: <arm(s)>
CRITERION: <pass/fail rule, e.g. ON − OFF ≥ 0.10>
DEVICE: GPU | CPU
DEVICE_REASON: <required when CPU>
PLANNED: RAM <GiB>, VRAM <GiB>
OWNER: <agent or main>
ENVELOPE: <absolute path>
DEADLINE: <JST time>
STOP_IF: <cap hit | breach | silence past deadline>
```

```text
LOG: <ITERATION id>
RESULT: <measured value(s) + record locator>
VERDICT: <which rival died; or none, with why>
UNEXPLAINED: <causes left open>
PEAK: RAM <GiB>, VRAM <GiB>
RELEASED: <time>
NEXT: <the next ITERATION id, citing this entry>
```
