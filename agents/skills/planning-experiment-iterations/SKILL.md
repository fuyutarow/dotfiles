---
name: planning-experiment-iterations
description: >-
  Plans ONE research experiment iteration as a boxed crucial test: rival hypotheses with differing
  predictions, data-only oracle first, minimal test (~2 min, 600 s cap, no sweep), frozen
  baseline/control/criterion, GPU first, planned/peak/release resources, deadlines, and a refutation
  log that picks the next test. Use for 実験計画, 次の実験, 6分報告, 最小実験, 空き資源. Owns
  ITERATION_PLAN/LOG. PURPOSE: admission/RUN_INTENT→directing-research-sections; costly bet→
  acting-on-hypotheses; evidence validity→validating-experimental-evidence; envelopes→orchestrating-agents.
  English skill; respond in the user's language.
---

# Planning experiment iterations

> **Version**: v2609.1.0 (2026-09-27) — initial forge from a live research session and a nine-skill inventory.

```bash
test -f assets/ITERATION-PLAN.md
test -f tests/triggers.md
test -f tests/forge-verification-ledger.md
bun ../forging-skills/scripts/skill-check.ts .
```

## LAW — maximize hypotheses eliminated per wall-minute and per reserved resource

> An iteration exists to kill a hypothesis. Its value is the discriminating receipts it yields,
> divided by the wall time and the reservations it holds. A run that cannot change which named
> hypothesis dies is waste at any size. Nothing launches without its ITERATION_PLAN row, and the row
> is frozen at launch.

## Function map — SOLE owner

| Input state | Verb | Owned artifact | Next state |
|---|---|---|---|
| Evidence so far + ≥2 rival hypotheses + measured free resources | plan | `ITERATION_PLAN` row (`assets/ITERATION-PLAN.md`) | boxed test launched |
| Terminal receipt, cap hit, or breach | record | `ITERATION_LOG` entry | next plan cites this entry |

The receipt, admission, and evidence disposition stay with their owners (§ Routing). This skill owns
the test's shape, size, box, device, resource line, and the choice of the next test.

## Gates — each leaves a field in the row

| Gate | Decision | Required field | Fail → |
|---|---|---|---|
| I1 RIVALS | Name ≥2 hypotheses and the value each predicts for the SAME observable | `RIVALS`, `PREDICTIONS` | A prediction every rival shares is dropped; with no differing prediction, do not launch |
| I2 ORACLE | When a data-only ceiling or oracle is computable, compute it before the learner run | `ORACLE` (value + locator) or `ORACLE: NONE (<why>)` | A learner run without it cannot claim agreement with theory |
| I3 BOX | Size the test by time and by the prediction gap, never by the registered battery | `SCALE_BASIS`, `TARGET_WALL_S`, `CAP_S=600` | Cut scale; never raise the cap |
| I4 FREEZE | Baseline, control, pass/fail criterion, device, and planned RAM/VRAM written before launch | `BASELINE`, `CONTROL`, `CRITERION`, `DEVICE`, `DEVICE_REASON`, `PLANNED` | Changing any after launch voids the test |
| I5 DISPATCH | Every delegated run gets owner, envelope, deadline, termination, and hand-back trigger | `OWNER`, `ENVELOPE`, `DEADLINE`, `STOP_IF` | An overdue or silent run is stopped and its resources released |
| I6 RECORD | Result, refuted hypotheses, unexplained causes, peak and release | `ITERATION_LOG` entry | The next row must cite it in `FROM_EVIDENCE` |

## Decision tables

**Scale (I3).**

| If… | Then |
|---|---|
| The rivals' predictions separate by more than the decision margin at scale n | Use the smallest such n, K, and family |
| A pilot runs past ~2 min | Cut the scale before the next launch |
| The run hits 600 s | TERM it; the partial receipt is the result |
| A minimal receipt already points one way | One registered-scale confirmation may run; each job still capped at 600 s |
| The plan needs a parameter or seed sweep, a scale study, or a port | It is not an iteration; the scale release belongs to `directing-research-sections` |

**Device (I4).**

| If… | Then |
|---|---|
| A conforming GPU path exists for the tested code | `DEVICE: GPU` |
| No GPU path exists yet | `DEVICE: CPU`; `DEVICE_REASON` names the missing path; the GPU port is the next critical-path item |
| The run computes data only, with no learner (an oracle or ceiling) | `DEVICE: CPU` with that reason |
| The GPU path is unproven (bit identity or causality open) | Do not stack new experiments on it; the proof test comes first |

**Free resources (after I6).**

| If… | Then |
|---|---|
| A test on the critical path is admissible and fits the free RAM and VRAM | Plan its row |
| Nothing admissible is ready | Leave the capacity idle and state the reason in the report |
| The only candidates are comparators, re-measurements, or side questions off the critical path | Idle is correct; do not launch them |
| Launches are denied while actual use is low | Oversized reservations are the cause; right-size the envelope from the measured peak before adding work |

**Main thread while runs execute.** Ground the next row: read the primary source behind the
next rival, compute its data-only oracle, or check the code path the evidence will rest on. Never
start a second test on the same question, and never write a status line with no change in it.

## Report (when the human set a cadence)

Order: artifacts and measured results → ticket states → next rows and the RAM/VRAM plan → ETA (JST).
Each ETA is `ontime` (plan kept), `delta` (time moved), or `pivot` (goal or policy changed), with
its reason. When nothing changed, say so in one line.

## Deny-list

- Launch a run whose row lacks any I1–I5 field, or edit a frozen field after launch.
- Run a sweep, a scale study, or a battery inside an iteration.
- Fill idle GPU or RAM with comparators, re-measurements, or questions off the critical path.
- Choose CPU for a learner run without `DEVICE_REASON`.
- Raise a cap mid-run, or treat an OOM or breach as a result.
- Count a run with no differing prediction as progress.
- Choose the next test without citing an `ITERATION_LOG` entry.
- Leave an agent dormant after its deadline, or resources reserved after its run ends.

## Routing — sibling cuts

| Sibling | Cut |
|---|---|
| `directing-research-sections` | PURPOSE: WHO may admit, register, and commit (mandate, `RUN_INTENT`, receipts) → there; WHAT test, how big, how long, on which device → here. Inside a section, the row fills `RUN_INTENT`'s scale and deadline fields. |
| `acting-on-hypotheses` | DECISIVE: is the next action costly or hard to reverse? Yes → there (Commit/Pivot/Kill). No, a boxed reversible test → here. |
| `forming-hypotheses-from-anomalies` | Sequential: an anomaly with no explanation → there, one hypothesis; that hypothesis plus its rivals → here. |
| `validating-experimental-evidence` | PURPOSE: whether a result is valid evidence (registered path, leakage, footing) → there; this skill freezes the controls it will need. |
| `orchestrating-agents` | Mechanics: envelope schema, admission, reservation reserves, TERM/KILL → there (P7, C4). A ticket deadline is a resource control, not the Director-content clock that `commanding-research-fleets` forbids. |
| `optimizing-julia-gpu-kernels` | A GPU port or kernel's own correctness and speed → there; choosing the device for one test → here. |

## MUST NOT FIRE

| Ask | Route |
|---|---|
| "Should we commit the quarter to approach X?" | `acting-on-hypotheses` |
| "Design the whole research programme" | `supervising-research-programmes` |
| "Is this benchmark score leaking?" | `validating-experimental-evidence` |
| "Write the resource.json for this job" | `orchestrating-agents` |
| "Why is this kernel slow?" | `optimizing-julia-gpu-kernels` |

The full fire/no-fire set is `tests/triggers.md`.
