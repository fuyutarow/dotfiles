# Forge verification ledger — planning-experiment-iterations

This is the F3 ledger for the initial v2609.1.0 forge. Append on reforge; do not overwrite.

## 0. Existence gate

- Knowledge artifact: the ITERATION_PLAN row, which makes each test a crucial test between named rivals, sized to about 2 min.
- Blocking failure removed (2026-09-27, firedancer, live session):
  - A 12-arena battery ran about 1.5 h on an unregistered harness, then was retracted.
  - A permute arm took 1,873 s.
  - Earlier O(n²) runs took 30–120 min.
  - Comparator and re-measurement batteries filled idle capacity. Their 6 GiB reservations then blocked the GPU job's admission.
  - The owner had to repeat "GPU first" and "no sweeps or large runs" several times.
- Expected decision-time delta: one discriminating receipt per 6-minute iteration, instead of one per 30–120 min.

## 1. Harvest (read-only inventory of 9 skills, 2026-09-27)

Existing owners, now cited instead of restated:

| Owner | Rule |
|---|---|
| `directing-research-sections` | Minimal existence/discriminator first; the scale/sweep/port release; WIP=1 |
| `orchestrating-agents` | P7 envelopes and reserves; GPU-first `gpu_status`; peak/release receipts; C4 hard deadlines |
| `validating-experimental-evidence` | EV0–EV4 |
| `acting-on-hypotheses` | Pin the threshold before building |

Duplicates found (left at their altitudes, now pointed to from here):

| Rule | Places |
|---|---|
| Idle capacity never creates work | 4 |
| Minimal-first | 2 |
| Negatives count | 2 |
| Commit the criterion before measuring | 3 |

Conflict found: `commanding-research-fleets` forbids clock-keyed Director instructions, while C4 and `RUN_INTENT` require deadlines. The Routing row resolves it: a ticket deadline is a resource control, not Director content.

Gaps this skill fills:
- a crucial test between named rivals;
- Build→Break→Fix;
- the wall-clock box;
- a scale basis taken from the prediction gap;
- main-thread work while runs execute;
- the per-iteration row;
- the CPU justification for learner runs.

## 2. Findings and resolution

| Date | Lens | Finding | Resolution |
|---|---|---|---|
| 2026-09-27 | placement | `directing-research-sections` claimed 「局所的な実験計画」 but fires only under a SECTION_MANDATE, so everyday iterations had no owner | PURPOSE cut: authority there, test shape here; pointer added there |
| 2026-09-27 | calibration | The model's default failure is to fill idle capacity and to size tests by the registered battery | Free-resource table and scale table placed in SKILL.md, not in a reference |

## 3. Mechanical record

- Structural floor: `bun agents/skills/forging-skills/scripts/skill-check.ts agents/skills/planning-experiment-iterations`.
- F3 solo-tier waiver (2026-09-27): the trigger set was desk-checked serially; no live model trigger eval ran.
