---
name: driving-bibifi-cycles
description: >-
  Maximizes knowledge discovery through Experimental and Formal Methods using short BIBIFI cycles.
  Use for 実験計画, 6分イテレーション, マイクロチケット, massive parallelism, ETA/JST,
  idle CPU/RAM/VRAM, and research execution that keeps stalling.
  Selects useful work, expands independent agent microtickets, consumes results and replans immediately.
  Owns ITERATION_PLAN/LOG in existing records; targets ~2-minute experiments, maximum 10 minutes.
  Dispatch and enforceable limits→orchestrating-agents; evidence→validating-experimental-evidence;
  proof→proving-theorems; theory→systematizing-theories; section admission→directing-research-sections.
  Workflow-native: selection and acceptance stay with their owner; independent work runs concurrently.
  English skill; respond in the user's language.
---

# Driving BIBIFI cycles

> **Version**: v2609.3.1 (2026-09-27) — observed execution and qualified results replace assumed batch progress.

```sh
for f in assets/ITERATION-PLAN.md references/microticket-patterns.md \
  tests/triggers.md tests/decision-cases.md tests/scheduling-cases.md \
  tests/operational-rehearsal.md tests/forge-verification-ledger.md; do test -f "$f" || exit 1; done
bun ../forging-skills/scripts/skill-check.ts .
```

## LAW — maximize valid discovery per unit time

Maximize the throughput of knowledge discovery from Experimental and Formal Methods.
Select new, valid, goal-relevant evidence, falsifications, counterexamples and checked proof results.
A repair matters through the next discovery it enables. Report that enabling work separately.
Ticket counts, code volume, reports, device utilization and agent count are not discovery units.
Do not inflate progress with known results, duplicate observations or irrelevant easy questions.

Attack the current critical dependency; use remaining capacity for useful independent questions.
Expand across available agent slots. GPU scarcity does not serialize source, proof or isolated preparation work.
Each result may obsolete work already running. Commit to a short return, then select again.
The parent owns coordination even when the work is delegated. A plan or dispatch message is not execution.

Stable tokens: `BIBIFI`, `MICROTICKET`, `ITERATION_PLAN`, `ITERATION_LOG`, `ontime`, `delta`, `pivot`.

## Ownership — one loop, existing records

`authorized goal + current evidence/resources -> select -> execute -> consume -> reselect`.
Own the rolling work selection and its plan/log inside the project's existing ticket/run/finding system.
Do not create another database, launcher, authority hierarchy or blanket approval step.
One question per microticket does not mean one active question for the fleet.
Under a formal section, preserve its admission, whole-cycle WIP and distinct learning-commit owners.
Partial build returns can unblock authorized work but are not terminal run receipts or LEARN commits.

## Start with a checkable result, not a large plan

Read the prior release ETA, completion criteria, open work and latest accepted evidence.
Check available/reserved CPU, RAM, VRAM, GPU load, agent slots and live write ownership.
Unknown values stay `未確認` / `UNKNOWN`; never infer execution or free capacity from a sent message.
Choose the first result that can change the next decision and the dependency preventing it.
Retrieve the relevant predecessor, interface and failure witness before replacing or reimplementing it.
Record the transferable part and current mismatch; do not commission a whole-history survey to begin one repair.

For the next action, consume orchestration C0's current capability receipts:
launcher/identity, worker update/stop, resource cap/release, and consumer hand-back as applicable.
Missing capability becomes one bounded repair/probe. Unrelated useful work proceeds immediately.
A skill installed on disk is not proof a live worker loaded it; bind important rules into the current brief.
Reuse unchanged valid receipts; do not rerun a readiness ceremony before every ticket.

## The microticket — one useful decision within reach

Use the compact card in `assets/ITERATION-PLAN.md`, inheriting unchanged context by exact locator.

| Field | Must determine |
|---|---|
| Question / consumer | Which live decision changes, or which discovery dependency is removed? |
| Build → Break → Fix | Small artifact/witness; discriminating check; conditional repair/retain/reject action |
| Binding / validity | Current premise, input/code or statement version; baseline/control/criterion before measurement |
| Work / resources | Owner, read/write scope, agent work versus admitted compute; phase footprint and actual device reason |
| Return / cancellation | First checkable result and deadline; invalidating result, safe stop/release and next consumer |

A whole component, inventory, port or multi-stage revision is a container, not an executable microticket.
Slice by a consumed outcome, not an arbitrary function count. Preserve mechanism, power and claim scope when shrinking.
Use diagnostic expected-vs-observed checks for implementation work; do not invent scientific hypotheses for forms.
For formal work, pin the exact statement and proof status; a sketch cannot silently become a checked theorem.

| Clock | Rule |
|---|---|
| First useful return | Within the next six-minute window; earlier if pending evidence could invalidate the assignment |
| Experiment | About two minutes target; ten minutes maximum or the tighter active cap, including launched setup/compile |
| Worker / queue | Finite return and lifetime, covering preparation, admission wait and recording as well as execution |

Two minutes is a target, not a launch ban. Six minutes is feedback/report cadence, not a process kill boundary.
Tests and profiling inside this loop use its experiment cap. P7 installs and observes the real stop mechanism.
Use GPU for GPU-capable experiments. Record a concrete CPU reason and obey stricter active device constraints.
Prompt deadlines alone enforce nothing. Cleanup grace is not extra experiment time.
No sweeps or large experiments; renaming their cells microtickets does not change their information value.

## Execute continuously — decide on each event

| Observed state/event | Action now | Evidence to consume |
|---|---|---|
| Critical action ready or blocker cleared | Launch the smallest real path and confirm it actually starts through C0 | Start receipt or explicit admission wait/blocker, not an assumed retry |
| Independent useful agent work ready | Launch across fitting slots/host capacity, even while GPU phases wait | Disjoint scope, short return, named consumer |
| Critical dependency blocked | Assign its smallest unblocker and continue unaffected work | Exact missing input, owner and next check |
| Partial result arrives | Check its boundary and pass it to its consumer immediately | Artifact plus consumer receipt, or explicit pending/blocker |
| Result changes a premise | Reassess affected running/queued tickets; continue, shrink or stop | Version delta and observed owner action/release |
| First return missed | Inspect actual phase/job/artifact; unblock, re-slice or cancel | C0 intervention; not another unchanged ETA |
| Priority work waits behind an owned side job | Reconsider that job at its declared safe stop point | Reservation and confirmed release; no unauthorized external kills |
| Resource/process cap exceeded | Stop through the owner and fix the stop path before reusing it | Partial evidence, effective cap, stop/cleanup receipt |
| Launcher/setup failure | Repair and exercise one fixture; stop identical queue retries | Accepted/rejected invocation and record read-back |
| No useful work fits | Inspect blocker, successor and reusable preparation slices | Actual remaining constraint and event that changes it |

Act when the event arrives; never wait for the report tick or every worker in a wave.
Do not require another parent reply for a preauthorized branch whose scope, premises and resources still hold.
Preserve raw failures and falsifications. An operation failure is not a scientific negative and does not erase valid evidence.

## Parallelism without whole-component handoffs

Keep agent-ready work separate from compute-admission waits in the same board.
Parallelize distinct source, proof, counterexample and interface checks, plus isolated patch proposals.
Use a single writer/integrator per live shared file; parallel thinkers return bounded proposals on frozen inputs.
NONCOMPUTE means the declared workload, not zero host cost or permission for hidden tests/fanout.
Actual platform, host, data-access and write constraints apply; a fixed small-team cap does not.

Consume compact artifact returns and exception deltas rather than every transcript.
Use deterministic joins for mechanical aggregation; domain owners retain scientific judgment and acceptance.
If results backlog, repair routing/consumption first. Throttle only branches blocked by contention or stale decisions.
Respect blind-review visibility; orchestration owns what may cross each role boundary.
Never create duplicate work just to occupy slots or leave a useful ready question idle because another stream is slow.
Tie each next ticket to consumed evidence or a cited primary source and its authorized question.
Free capacity or an unsupported worker assertion is not a basis for inventing new work.

## Integrate early; keep future work conditional

Before scaling, run a tiny fixture through the actual changed input → component → update → scoring/consumer path.
Exercise the changed branch and a relevant negative case; component-only tests cannot certify their integration.
Execution prerequisites must hold. Interpretation/promotion gaps block those claims, not every useful scoped diagnostic.
Use evidence EV1 for loaded code/input identity, including material imports, configuration and warm-worker state.
Use supported immutable run inputs while development continues. Otherwise serialize only the required read/write window.
Do not freeze development until a long benchmark queue drains.

Select the next discriminator per dependency chain; fixed comparison arms may run together for that one question.
Recheck each queued launch against current evidence, binding, priority, capacity and remaining lifetime.
Do not rerun every arena on every revision. A newly decisive result cancels obsolete successors now.
Keep one necessary baseline if useful; sunk work and an old assignment do not justify finishing the rest.
Reuse bounded warm workers and immutable references, resetting experimental state and charging retained resources.

## Qualification and the six-minute report

Evidence EV2/EV3 owns information access, batch-update semantics, effective interventions and comparison footing.
A faster new learning protocol need not be equivalent. A historical score is not current evidence.
The GPU skill owns stage budgets/profiles. Repair the largest recoverable whole-run cost, not an isolated ratio.
The theory owner consumes qualified findings and returns versioned premise/prediction changes to this loop.
Report new discovery, enabling work, failure and open uncertainty separately; repeated status earns no cycle credit.
Report only observed starts, completions and consumed results; a requested batch is not an executed batch.
Use evidence dispositions separately from goal acceptance: valid low scores remain evidence, published rows need qualification.

Every six minutes while active, report briefly in JST:

1. Checked artifacts, measured results or proof status, and the decisions they changed.
2. Ticket changes, current blocker, parent intervention and worker/job stop/release state.
3. Next agent microtickets and CPU/RAM/VRAM allocation, measured peaks/releases and any idle-capacity reason.
4. Release ETA versus the previous schedule: `ontime` unchanged, `delta` date changed, `pivot` goal/approach changed.

No previous schedule means initial baseline. Keep run-return ETA separate from release ETA; give the change rationale.
If nothing landed, say so and state the intervention. Do not invent progress or replace the required report with silence.
Stop at completion, user stop or a real authority boundary. Hand back accurate partial state and release owned resources.

## Owners and supporting material

| Need | Owner / reference |
|---|---|
| Dispatch, receipt states, lifetime, admission, interruption and isolation | `orchestrating-agents` C0/C3a/P7; this skill chooses work |
| Experimental validity, scope and comparisons | `validating-experimental-evidence` |
| Exact proof and theory changes | `proving-theorems`, then `systematizing-theories` as applicable |
| Code repair or GPU path | `implementing-and-debugging` plus language/GPU owner |
| Formal section admission or programme allocation | `directing-research-sections` / `supervising-research-programmes` |
| Costly irreversible commitment | `acting-on-hypotheses`; a bounded probe grants no adoption authority |
| Concrete slices, dependencies and parallel examples | `references/microticket-patterns.md` |
| Compact board, ticket, return and report | `assets/ITERATION-PLAN.md` |
| Skill validation | `tests/triggers.md`, `tests/decision-cases.md`, `tests/scheduling-cases.md`, `tests/operational-rehearsal.md` |
| Historical audits and measured verification limits | `tests/forge-verification-ledger.md` |

No harness → execute ready work serially with observed receipts; do not claim parallelism or enforced cancellation.
