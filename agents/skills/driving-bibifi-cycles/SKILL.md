---
name: driving-bibifi-cycles
description: >-
  Maximizes knowledge discovery through Experimental and Formal Methods using short BIBIFI cycles.
  Use for Strong Inference, アノマリーからアブダクション, 競合仮説・予測表・排除表,
  実験計画, 6分イテレーション, マイクロチケット, benchmark突破 / ベンチマーク未測,
  massive parallelism, ETA/JST,
  idle CPU/RAM/VRAM, 理論研究の実行, 研究を進めて, and an authorized discovery loop that is stalling.
  Selects useful work, expands independent agent microtickets, consumes results and replans immediately.
  Owns ITERATION_PLAN/LOG in existing records; targets ~2-minute experiments, maximum 10 minutes.
  Dispatch and enforceable limits→orchestrating-agents; evidence→validating-experimental-evidence;
  proof→proving-theorems; theory→systematizing-theories; section admission→directing-research-sections.
  Workflow-native: selection and acceptance stay with their owner; independent work runs concurrently.
  English skill; respond in the user's language.
---

# Driving BIBIFI cycles

> **Version**: v2610.2.0 (2026-10-01) — reorganize goal selection and replace periodic reporting with event updates.

```sh
for f in assets/ITERATION-PLAN.md assets/STRONG-INFERENCE.md \
  references/microticket-patterns.md references/scientific-loop.md references/skill-composition.md \
  tests/triggers.md tests/decision-cases.md tests/scheduling-cases.md \
  tests/operational-rehearsal.md tests/forge-verification-ledger.md \
  tests/postmortem-2026-10-01-target-drift.md; do test -f "$f" || exit 1; done
test ! -f references/target-benchmark-loop.md || exit 1
bun ../forging-skills/scripts/skill-check.ts .
```

## On invocation — do the work

`/driving-bibifi-cycles` means execute/resume the current authorized discovery loop, not print its report format.
Unless the user explicitly requests status only, inspect the current evidence and take the next justified action now.
Consume a result, perform a bounded check, start a ready microticket or intervene on a real blocker within your role.
Then report what actually changed. A report is a checkpoint; continue the authorized work after it.
If no action can advance the goal, establish why with the dependency search below.
Do not invent activity to satisfy a quota.
Repeated status or a later ETA, without new evidence or justified intervention, does not fulfill the invocation.

## LAW — maximize valid discovery per unit time

Maximize valid discovery toward the authorized outcome through Experimental and Formal Methods.
Select new, valid, goal-relevant evidence, falsifications, counterexamples and checked proof results.
A repair matters through the next discovery it enables. Report that enabling work separately.
An informative precursor is not an accepted target result; keep both counts distinct.
Ticket counts, code volume, reports, device utilization and agent count are not discovery units.
Do not inflate progress with known results, duplicate observations or irrelevant easy questions.

Attack the current critical dependency; use remaining capacity for useful independent questions.
Expand across available agent slots. GPU scarcity does not serialize source, proof or isolated preparation work.
Each result may obsolete work already running. Commit to a short return, then select again.
The parent owns observation, intervention and result consumption after dispatch. C0 owns that operational contract.
A plan, sent instruction or worker's private queue is not execution.

Stable tokens: `BIBIFI`, `MICROTICKET`, `ITERATION_PLAN`, `ITERATION_LOG`, `ontime`, `delta`, `pivot`.

## Ownership — one loop, existing records

`authorized goal + current evidence/resources -> select -> execute -> consume -> reselect`.
Own the rolling work selection and its plan/log inside the project's existing ticket/run/finding system.
Do not create another database, launcher, authority hierarchy or blanket approval step.
This is the default execution owner for ordinary authorized R&D, including theoretical research.
Recover the bounded goal from the task before selecting work; a bare request grants no invented goal or mandate.
Question clarification within that goal stays with the relevant content owner. Programme allocation is a different decision.
One question per microticket does not mean one active question for the fleet.
Under a formal section, preserve its admission, whole-cycle WIP and distinct learning-commit owners.
Partial build returns can unblock authorized work but are not terminal run receipts or LEARN commits.

## Start with a checkable result, not a large plan

Read the prior release ETA, completion criteria, open work and latest accepted evidence.
For a registered benchmark goal, read the existing result registry and EV disposition.
Use the outcome table in `references/microticket-patterns.md`.
Select the first missing actual-path witness; host scores and old-edition rows stay precursors.
Check available/reserved CPU, RAM, VRAM, GPU load, agent slots and live write ownership.
Unknown values stay `未確認` / `UNKNOWN`; never infer execution or free capacity from a sent message.
Choose the first result that can change the next decision and the dependency preventing it.
Before replacing a working path, locate its useful mechanism, actual consumer and failure witness.
Map what transfers and the first same-path carryover check through EV4; do not start from a blank design.

For the next action, read orchestration C0's current capability receipts.
Check launcher/identity, worker update/stop, resource cap/release and consumer hand-back as applicable.
Missing capability becomes one bounded repair/probe. Unrelated useful work proceeds immediately.
A skill installed on disk is not proof a live worker loaded it; bind important rules into the current brief.
Reuse unchanged valid receipts; do not rerun a readiness ceremony before every ticket.

## Scientific direction before scheduling

For a scientific anomaly or a Strong Inference request, use `references/scientific-loop.md` before choosing jobs.
Use `references/skill-composition.md` when choosing between explanation, generation, testing, evidence and theory work.
Skill boundaries separate decisions, not mandatory agents or pauses. Apply the needed operation in the current context when possible.
Consume the return and take the next authorized action. A packet or routing decision is not task completion.
Join the current observation or failure to an observed-versus-expected contrast under matched conditions.
Keep explicit rivals, auxiliary conditions and an open residual. Do not assume one cause or exhaustive candidates.
Before measuring, derive rival-dependent predictions and the result-to-exclusion/next-action table.
Drop a prediction that cannot separate its named rivals. Do not drop the hypothesis by rhetoric.
Parallelize independent discriminators and formal counterexamples. Consume each result at its own scope immediately.
Return a candidate revision of the hypothesis, model, design or procedure: retain, change, predict and check first.
A promising idealized construction or local repair does not certify the whole target or every operating condition.
Use the four compact tables in `assets/STRONG-INFERENCE.md`; inherit existing evidence instead of duplicating it.
Routine deterministic repairs need only their smallest failing witness, not an invented hypothesis portfolio.

## Select useful ready work; size concurrency from current evidence

Run this loop at startup, a result/phase/resource change, or a missed return. Reuse unchanged receipts.

| Step | Decision now | Observable output |
|---|---|---|
| 1. Name the decision | Which authorized acceptance predicate remains open? For a benchmark, is the first gap concept eligibility, actual-path execution, or a qualified row? | Target obligation, current evidence and its consumer |
| 2. Test the dependency | Is the wait for missing evidence/apparatus, a claim gate, a live writer, or merely someone's queue? | Exact missing input and the observations still possible without it |
| 3. Find independent returns | Inspect relevant residuals, controls, proof obligations, stable interfaces and prepared inputs | Useful bounded slices, not a new inventory or filler |
| 4. Check information value | Can the intervention reach the target consumer? Would either outcome change the next action? | Existing trace/control or bounded reachability check; scientific-loop owns interpretation |
| 5. Admit a useful set | Fit CPU/RAM/VRAM, agent slots, ownership and critical headroom; apply C0/P7 and required domain admission | Launch fitting admitted slices with verified stop paths; pending rows name their actual constraint |
| 6. Consume and resize | Did results, slowdown or released capacity change that set? | Read-back, revised priorities, starts or safe stops through C0/P7 |

Protect the critical return without serializing independent reasoning, preparation or isolated proposals.
Every ticket needs a current authorized question and an evidence/source binding.
Free capacity supplies no evidence or authority.
A single live writer still permits analysis on pinned inputs and proposals in separate files.
Keep agent work and admitted compute separate; NONCOMPUTE still has host cost and forbids hidden compute/fanout.
Use comparable timing or a bounded probe for shared compute. Resource fit alone does not prove throughput fit.
On contention, reduce only conflicting work. On spare capacity, select useful ready work now; do not wait for a report.
Repeat for further useful candidates that fit; revisit authorized open questions with current evidence.
No useful bounded return: record why and leave capacity idle. Do not invent filler.
No fixed small-team, two-run wave or one-job-per-GPU rule replaces the actual fit decision.
Do not delay independently valid observations until a full release or an unrelated user decision.
Respect authority, blind visibility and required evidence gates. Narrow the claim instead of bypassing them.
If no useful slice fits, record the inspected candidate and blocking fact, then the next event that changes it.
An empty queue or “integration is busy” does not justify waiting. Low utilization does not itself establish useful work.
Use `references/microticket-patterns.md` for concrete dependency cuts and queue mechanics.

## The microticket — one useful decision within reach

Use the compact card in `assets/ITERATION-PLAN.md`, inheriting unchanged context by exact locator.

| Field | Must determine |
|---|---|
| Question / consumer | Which live decision changes, or which discovery dependency is removed? |
| Build → Break → Fix | Small artifact/witness; discriminating check; conditional repair/retain/reject action |
| Binding / validity | Current premise, input/code or statement version; baseline/control/criterion before measurement |
| Work / resources | Owner, read/write scope, agent versus compute phase; footprint, actual device reason and critical-work headroom |
| Return / cancellation | First decision-changing result and deadline; budget source, effective stop, invalidation, release and consumer |

A whole component, inventory, port or multi-stage revision is a container, not an executable microticket.
Slice by a consumed outcome, not an arbitrary function count. Preserve mechanism, power and claim scope when shrinking.
Apply the first-return bound to theory, implementation, integration and launcher repair, not just experiments.
Keep future evidence-dependent work in the parent's conditional backlog, not an unconditional builder queue.
After each decisive return, select again. Preauthorized branches may proceed only while their bindings and guards still hold.
Examples: one lemma/counterexample; one working interface path; one launcher regression with a start receipt.
Use diagnostic expected-vs-observed checks for implementation work; do not invent scientific hypotheses for forms.
For formal work, pin the exact statement and proof status; a sketch cannot silently become a checked theorem.

| Clock | Rule |
|---|---|
| First useful return | Within the next six-minute window; earlier if pending evidence could invalidate the assignment |
| Numerical run in this loop | About two minutes target; ten minutes maximum or the tighter active cap, including launched setup/compile; official confirmation, tests and profiling are included |
| Worker / queue | Finite return and lifetime, covering preparation, admission wait and recording as well as execution |

Two minutes is a target, not a launch ban. Six minutes bounds the first useful return, not a reporting cron or process kill.
Bind the user/domain budget before dispatch. The operator compares the launch envelope against it before P7 admission.
Record target duration separately from the hard cap. A two-minute target does not impose a two-minute hard limit.
Bind the workload before its label: official numerical confirmation uses the same active budget.
The default cap is the minimum of ten minutes, stricter active limits and remaining ticket lifetime.
An explicit user instruction or authorized domain policy may change the default.
Domain exceptions cannot relax an active user cap.
Record any exception's source and exact scope; the operator cannot invent that authority.
Labels such as official, production or validation do not create an exception.
P7 owns stop/release enforcement. An ETA exceeding the cap rejects that run design before admission.
Choose a smaller discriminating witness, reuse valid setup/evidence, or report that no valid test fits this budget.
Do not obtain a long run by relaunching timed-out work or chaining slices that return no independent decision.
Keep real partial evidence and its limits; a short prefix cannot certify a full benchmark.
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
| First return missed | Parent reads actual phase/log/partial artifact now; unblock, re-slice, cancel or justify bounded continuation | C0 observation and action; no guessed phase or automatic ETA extension |
| Critical work waits behind a worker's older assignment | Distinguish artifact dependency from worker queue; freeze/reassign a safe slice or split an independent interface | Accepted brief/ownership change and first consumer return, not merely a new agent |
| Priority work waits behind an owned side job | Reconsider that job at its declared safe stop point | Reservation and confirmed release; no unauthorized external kills |
| Experiment cannot finish within its bound | Reject before launch, or stop through its owner; redesign the test | Preserved partial evidence, inherited cap and observed release; no larger retry envelope |
| Resource/process cap exceeded | Stop through the owner and fix the stop path before reusing it | Partial evidence, effective cap, stop/cleanup receipt |
| Launcher/setup failure | Repair and exercise one fixture; stop identical queue retries | Accepted/rejected invocation and record read-back |
| No useful work fits | Challenge the claimed dependency and inspect independent evidence work before waiting | Checked alternatives, actual constraints and next changing event |

Act when the event arrives; never wait for the report tick or every worker in a wave.
Do not require another parent reply for a preauthorized branch whose scope, premises and resources still hold.
For a launcher repair, distinguish required regression/readiness checks from unrelated suite completion.
Consume the smallest sufficient check; retain required release gates. Confirm an actual start after the blocker clears.
Preserve raw failures and falsifications. An operation failure is not a scientific negative and does not erase valid evidence.

## Integrate early; keep future work conditional

Before scaling, exercise the smallest valid path from the changed element to its actual observation or consumer.
Include a relevant negative case; isolated component checks cannot certify their interaction.
Use EV3's obligation-closure table when consuming the result.
A scratch success opens an integration candidate; the default-path defect remains open.
Keep the remaining consumer check in the current ticket.
Execution prerequisites must hold. Interpretation/promotion gaps block those claims, not every useful scoped diagnostic.
Use evidence EV1 for loaded code/input identity, including material imports, configuration and warm-worker state.
Use supported immutable run inputs while development continues. Otherwise serialize only the required read/write window.
Do not freeze development until a long benchmark queue drains.

Select the next discriminator per dependency chain; fixed comparison arms may run together for that one question.
Recheck each queued launch against current evidence, binding, priority, capacity and remaining lifetime.
Do not rerun every arena on every revision. A newly decisive result cancels obsolete successors now.
Keep one necessary baseline if useful; sunk work and an old assignment do not justify finishing the rest.
Reuse bounded warm workers and immutable references, resetting experimental state and charging retained resources.

## Qualification and release updates

Evidence EV2/EV3 owns information access, protocol equivalence, effective interventions and comparison footing.
A changed procedure need not preserve the original behavior. Historical performance is not current evidence.
For GPU work, its specialist owns stage budgets/profiles. Select by recoverable whole-run cost, not an isolated ratio.
Consume the GPU owner's complete train/infer accounting before choosing the next optimization slice.
An efficiency-ratio increase or inference-only gain cannot close a learning-throughput target.
The theory owner consumes qualified findings and returns versioned premise/prediction changes to this loop.
Report new discovery, enabling work, failure and open uncertainty separately; repeated status earns no cycle credit.
Report only observed starts, completions and consumed results; a requested batch is not an executed batch.
Report a batch per attempt: requested, admitted, started, terminal and consumed may have different counts.
Separate evidence dispositions from goal acceptance. Valid low scores remain evidence; published rows need qualification.

Update the release plan on a result, missed return, changed blocker or ETA.
Also update when a premise or resource binding changes, or the user asks.
Use a periodic update only when explicitly requested. Do not install a status cron.

| Goal | First line of the update | Then report |
|---|---|---|
| Registered benchmark outcome | Accepted wins and eligible current-path members measured out of registered members; `UNKNOWN` for any unverified denominator | New qualified evidence, actual-path next return, blocker, release ETA |
| Other authorized discovery | New accepted learning or checked proof and the decision it changed | Enabling repair, next return, blocker, release ETA |

Keep run-return ETA separate from release ETA.
Use `ontime` only when observed progress supports the unchanged release date.
Use `delta` for a changed date and `pivot` for a changed goal or approach.
If the date lacks a basis, report `UNKNOWN` and the next
observable that can bound it. Use the clock for timestamped reports, never memory.
If nothing landed, state the intervention and the unchanged accepted-result count.
Do not repeat an old finding as a newly closed cycle. Reporting compliance cannot offset missed useful work.
Stop at completion, user stop or a real authority boundary. Hand back accurate partial state and release owned resources.

## Owners and supporting material

| Need | Owner / reference |
|---|---|
| Dispatch, receipt states, lifetime, admission, interruption and isolation | `orchestrating-agents` C0/C3a/P7; this skill chooses work |
| Experimental validity, scope and comparisons | `validating-experimental-evidence` |
| Exact proof and theory changes | `proving-theorems`, then `systematizing-theories` as applicable |
| Explanatory candidate generation | `forming-hypotheses-from-anomalies` for one contrast; `forging-novel-theses` for a seeded batch under its entry contract |
| Code repair or GPU path | `implementing-and-debugging` plus language/GPU owner |
| Formal section admission or programme allocation | `directing-research-sections` / `supervising-research-programmes` |
| Costly irreversible commitment | `acting-on-hypotheses` owns the discriminator, threshold, interpretation and Commit/Pivot/Kill; this loop may schedule its Build→Measure slice |
| Concrete slices, dependencies, benchmark outcome selection and predecessor transfer | `references/microticket-patterns.md` |
| Compact board, ticket, return and report | `assets/ITERATION-PLAN.md` |
| Skill validation | `tests/triggers.md`, `tests/decision-cases.md`, `tests/scheduling-cases.md`, `tests/operational-rehearsal.md` |
| Historical audits and measured verification limits | `tests/forge-verification-ledger.md` |
| Bounded source retrospective behind the benchmark-target rule | `tests/postmortem-2026-10-01-target-drift.md` |

No harness → execute ready work serially with observed receipts; do not claim parallelism or enforced cancellation.
