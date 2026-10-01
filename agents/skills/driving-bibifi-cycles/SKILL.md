---
name: driving-bibifi-cycles
description: >-
  Maximizes knowledge discovery through Experimental and Formal Methods using short BIBIFI cycles.
  Use for Strong Inference, アノマリーからアブダクション, 競合仮説・予測表・排除表,
  実験計画, 6分イテレーション, マイクロチケット, benchmark突破 / ベンチマーク未測,
  massive parallelism, ETA/JST, planning poker / スクラムポーカー,
  idle CPU/RAM/VRAM, 理論研究の実行, 研究を進めて, and an authorized discovery loop that is stalling.
  Admits outcome-linked, constraint-preserving short returns before allocating agents or compute.
  Owns ITERATION_PLAN/LOG in existing records; targets ~2-minute experiments, maximum 10 minutes.
  Dispatch and enforceable limits→orchestrating-agents; evidence→validating-experimental-evidence;
  proof→proving-theorems; theory→systematizing-theories; section admission→directing-research-sections.
  Workflow-native: selection and acceptance stay with their owner; independent work runs concurrently.
  English skill; respond in the user's language.
---

# Driving BIBIFI cycles

> **Version**: v2610.6.0 (2026-10-01) — sizing is required before a multi-ticket plan or ETA; poker when 2+ estimators exist.

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

The authorized outcome and its hard constraints define useful discovery.
Before allocating resources, name the live decision a result changes and its actual consumer.
A negative result may change that decision; success is not required for admission.
A valid but unrelated theorem, audit, refactor or skill revision is not ready work for this goal.
Explicit user requests for those artifacts supply their own authorization and outcome.

Attack the critical dependency first. Independent work must pass the same purpose and return checks.
Spare hardware and separate files establish capacity and isolation, not purpose.
Do not maximize reports, agents, tests or commits. A precursor remains distinct from target acceptance.
The parent consumes each result and intervenes on a missed return through orchestration C0.

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

## Admission order — apply before dispatch, including every side task

Use the current goal, evidence and existing work records. Reuse unchanged bindings.
Do these checks in order; resource availability cannot waive an earlier failure.

| Order | Required decision | Failed check |
|---|---|---|
| 1. Outcome and constraints | Bind the requested result and hard requirements: concept, target path, device, information access and budget. Read current-version evidence. | Retrieve the missing source or obtain the genuinely missing decision; do not invent an easier target. |
| 2. Purpose | Name the observed obstacle, current consuming task/test, and what distinct results would change next. A repair names the exact blocked call. | Defer work justified only by “might help later”, taxonomy, general cleanup or spare capacity. |
| 3. First return | Bind a checkable output, evidence-based duration estimate, six-minute due time and parent inspection. Preserve step 1 while shrinking. | Split or measure the unknown before dispatch. Low points cannot authorize an overlong or constraint-changing slice. |
| 4. Reuse and path | If a predecessor exists, locate reusable parts and declared carryover obligations. Bind the smallest consumer check to current requirements. | Retrieve or repair the missing interface. An authorized new frame may retire old obligations; document that change. |
| 5. Execution and fit | Apply the execution lookup below, then check ownership, capacity, critical headroom and C0/P7 for the selected path. | Reuse/re-slice before starting another actor; hold only conflicting work. |
| 6. Consume | Read the result, apply its scoped implication and re-evaluate dependent work now. | An unconsumed report or sent message does not close the ticket. |

For a benchmark goal, use current registry/EV evidence and the outcome table in `references/microticket-patterns.md`.
Size every item before publishing a plan of 2+ tickets or any release ETA; use that reference's estimation lookup.

| Informed estimators available | Required method |
|---|---|
| Parent plus 1+ worker with its own code/run context | Planning Poker: parent seals its estimates first; workers estimate blind; reveal; discuss high/low |
| Parent alone | Label the table `SOLO ESTIMATE` with reference items and ranges; never call it poker |

Estimates never authorize a launch and never relax the six-minute first return.
For an anomaly, use `references/scientific-loop.md` to construct a discriminating return, not a mandatory study phase.
Use `references/skill-composition.md` for content ownership; routine repairs need only a failing witness.

A first return can be a smallest working path, a counterexample or a located failure that changes the next action.
A line count, test-running message, repeated host result or revised ETA is not that return.
If a full score cannot fit, identify the first missing interface/state transition on the required execution path.
Do not demand full release acceptance for a local witness, or promote that witness into release acceptance.

Side work needs a named current consumer and a return before that consumer's decision point.
Independent proof, source and isolated preparation can qualify; “independent” alone cannot.
Repeated audits or retrospective/skill work need an explicit request or one demonstrated blocking question.
Review candidates on each result, premise, phase or resource change. Do not create a new planning store.

C0 owns actor delivery, interruption and consumer read-back; P7 owns effective compute caps and release.
Bind these requirements into the actual brief. Installed skill text does not prove a running worker received it.
Unknown capacity or capability stays UNKNOWN; repair only its dependent path.
Admit all purpose-qualified work that fits without delaying the critical return; impose no fixed fleet size.
If none fits, record the inspected options and next changing event. Do not invent filler.

### Execution lookup — a workflow is not the unit of a cycle

Default to the current context for one bounded decision. Reuse an available, correctly bound worker
or execution environment when it shortens the return. A phase name, failed conformance check or
`pivot` does not justify starting a design/review workflow.

| Available path / reason | Action |
|---|---|
| Current context has the inputs and can perform the bounded check | Perform it now; do not dispatch merely to obtain a plan or restate the evidence. |
| Existing worker/environment has valid context and an effective stop path | Reuse it, reset experimental state as required, and consume each return immediately. |
| New worker/workflow could shorten the decision, or required isolation/independent verification needs it | Compare the total return cost below; dispatch only the bounded justified slice through C0. |
| Startup cost or benefit is unknown and a valid direct path exists | Use the direct path. Unknown overhead is not zero and spare slots are not a launch reason. |
| A required capability is unavailable locally | Bound its smallest setup/probe and return an actual capability receipt; do not launch a whole design phase. |

Compare total time to a **consumed** result.
Include startup, context loading, queue/setup/compile, useful work, hand-back and parent inspection.
Reuse observed comparable costs; mark unknowns explicitly.
Charge dispatch preparation to the existing first-return window; launching or rebriefing does not reset it.
Keep the comparison in the existing ticket, not a new planning artifact or estimation ceremony.
Keep evidence-dependent design/build/verify phases conditional.
Act on an independently valid return without waiting for all branches.
Stable, bounded repeated work may amortize workflow startup.
Its admission still needs this comparison and the same event-driven consumption.

When conformance fails, preserve the failed predicate and its witness.
Directly derive/test one minimal repair or counterexample under the same constraints.
Delegate only a justified independent slice. Do not weaken the test or promise feasibility.
Do not replace the failed check with “a workflow to decide the design”.
Stop only work whose purpose depended on the rejected design.

## The microticket — one useful decision within reach

Use the compact card in `assets/ITERATION-PLAN.md`, inheriting unchanged context by exact locator.

| Field | Must determine |
|---|---|
| Outcome / consumer | Which acceptance predicate, observed obstacle and current consumer justify this work? |
| Build → Break → Fix | Small artifact/witness; discriminating check; conditional repair/retain/reject action |
| Binding / validity | Inherited hard constraints, exact execution path and code/input versions; baseline/control/criterion |
| Work / resources | Direct/reused/new execution path and total-return basis; owner, read/write scope, agent versus compute phase, footprint and headroom |
| Return / cancellation | Checkable first output, absolute due time and parent inspection; budget source, effective stop and consumer |

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
Bind the execution device to the user's policy and applicable domain contract; do not infer one from this skill's examples.
Under a GPU-first shared-path requirement, shrink the GPU path; do not build a host learner for later porting.
Prompt deadlines alone enforce nothing. Cleanup grace is not extra experiment time.
No sweeps or large experiments; renaming their cells microtickets does not change their information value.

## Execute continuously — decide on each event

| Observed state/event | Action now | Evidence to consume |
|---|---|---|
| Critical action ready or blocker cleared | Execute the smallest real path using the execution lookup; use C0 for an actual dispatch | Action/result receipt or explicit admission wait/blocker, not an assumed retry |
| Independent useful agent work ready | Apply the execution lookup, then dispatch justified slices across fitting capacity, even while GPU phases wait | Disjoint scope, total-return basis, short return, named consumer |
| Critical dependency blocked | Execute its smallest unblocker using the lookup; continue unaffected work | Exact missing input, owner and next check |
| Partial result arrives | Check its boundary and pass it to its consumer immediately | Artifact plus consumer receipt, or explicit pending/blocker |
| Result changes a premise | Reassess affected running/queued tickets; continue, shrink or stop | Version delta and observed owner action/release |
| First return missed | Parent inspects the named output and actual phase now. Stop dependent successors; unblock, re-slice or cancel. Continuation needs a specific attainable return within the existing lifetime. | C0 action and new bounded return; no unchanged container with a later ETA |
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
| Registered benchmark outcome | Accepted wins and eligible current-path members measured out of authorized suite members; `UNKNOWN` for any unverified denominator | New qualified evidence, actual-path next return, blocker, release ETA |
| Other authorized discovery | New accepted learning or checked proof and the decision it changed | Enabling repair, next return, blocker, release ETA |

Keep run-return ETA separate from release ETA.
Use measured comparable phase costs and observed capacity for elapsed-time ranges; points are a separate size unit.
No prior release date means an initial baseline, not `ontime`.
Use `ontime` only when observed progress supports the unchanged release date.
Use `delta` for a changed date and `pivot` for a changed goal or approach.
A future successful experiment is a condition, not an ETA basis. Keep dependent milestones conditional until it returns.
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
| Notebook artifact homes, launch/landing and edition acceptance | `keeping-research-notebooks`; this loop consumes its bindings |
| Exact proof and theory changes | `proving-theorems`, then `systematizing-theories` as applicable |
| Explanatory candidate generation | `forming-hypotheses-from-anomalies` for one contrast; `forging-novel-theses` for a seeded batch under its entry contract |
| Code repair or GPU path | `implementing-and-debugging` plus language/GPU owner |
| Formal section admission or programme allocation | `directing-research-sections` / `supervising-research-programmes` |
| Costly irreversible commitment | `acting-on-hypotheses` owns the discriminator, threshold, interpretation and Commit/Pivot/Kill; this loop may schedule its Build→Measure slice |
| Slices, estimate/poker choice, dependencies, outcome selection and predecessor transfer | `references/microticket-patterns.md` |
| Compact board, ticket, return and report | `assets/ITERATION-PLAN.md` |
| Skill validation | `tests/triggers.md`, `tests/decision-cases.md`, `tests/scheduling-cases.md`, `tests/operational-rehearsal.md` |
| Historical audits and measured verification limits | `tests/forge-verification-ledger.md` |
| Bounded source retrospective behind the benchmark-target rule | `tests/postmortem-2026-10-01-target-drift.md` |

No harness → execute ready work serially with observed receipts; do not claim parallelism or enforced cancellation.
