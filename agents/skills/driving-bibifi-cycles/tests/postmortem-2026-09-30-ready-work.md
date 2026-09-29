# Retrospective — useful work left behind an artificial dependency

Source attachment b65bf5b0-2a2e-443a-8150-1d89cb237790,1748lines,
SHA2562457ec2374bb133542bfe76aa8882005d1f1985ebd3612caf9c07a2247ba20f7.
Baseline002d66d. Outward reports are incomplete process evidence: sustained utilization, exact
historical loaded instructions and a complete admitted ready queue are unknown.

| Locus | Reported observation | Scoped finding |
|---|---|---|
| 24–36 | Several parallel streams; GPU90percent, VRAM3.6/12GB | Counterevidence to permanent idleness; spare VRAM alone does not justify more compute |
| 988–999 | GPU18percent, CPU load5/12; integration carries several repairs then prediction tests | Headroom reported, but admissible independent work and blocking facts are not joined systematically |
| 1130–1135 | Width diagnosis→validity→predictions→freeze→C2 on a sequential queue | Necessary data dependencies and one-worker sequencing are not distinguished |
| 1373 | Departed I/O owner's scope moved into integration with a later broad test bundle | Single-writer ownership does not itself require serial preparation or independent analysis |
| 1458,1686–1699 | Sequence rows first wait for C2/user decision, later run as current-version baseline | Stronger capability/feature gate and current scoped observations can have different dependencies; earliest readiness is unverified |
| 1653–1660 | C2 ON/OFF identical; the reported bottleneck is output selection | A reachability/sensitivity check is a useful first slice before interpreting mechanism effects |
| 1662 | CPU/GPU comparison skipped because CUDA was unavailable in the envelope | Declared device and usable execution capability differ; preserve UNKNOWN/SKIP |

Do not infer unused physical compute from every low-utilization sample, or prescribe a fixed larger
worker count. Do not call a CPU-sized diagnostic wrong merely because a GPU exists. The failure
under review is selecting/connecting useful work, not reaching an occupancy target.

## Reorganization decision

Replace the separate parallelism and waiting paragraphs with one core six-step work-selection loop:
live decision→dependency kind→independent returns→information value→joint admission→consume/resize.
The core owns this policy. Microticket patterns supply dependency examples and bounded queue mechanics;
scientific-loop owns interpretation of an intervention's path to the observable. P7 returns per-slice
resource constraints and retains feasibility/stop enforcement; no second scheduler or evidence owner is added.

Preserve critical headroom and broad useful concurrency together. Work blocked only for a release
claim, a live writer or a particular feature decision need not block independent scoped observations.
Inspect current residuals and obligations to discover slices, then act; no exhaustive survey or task-count quota.
A masked observable is not a falsification of the candidate mechanism. A reachable but genuinely null effect remains valid evidence.

## Frozen evaluation

OLD/NEW receive the same file-backed current task, preserved path and release contract, and capacity snapshot.
They must inspect sources, produce a grounded artifact now and update the next decision, not merely
describe future work. A later contended-capacity snapshot tests whether they preserve the critical
resource bundle while continuing independent file-only analysis. No GPU/numerical launch is authorized.
Keep inputs and output arms separate; withhold this expected-answer record and the fixture criteria.
Root reads actual outputs. A tie and any overcorrection remain explicit; this is not real R&D throughput evidence.
