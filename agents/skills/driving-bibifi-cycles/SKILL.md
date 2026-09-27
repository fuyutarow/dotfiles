---
name: driving-bibifi-cycles
description: >-
  Runs goal-directed R&D through microticket BIBIFI (Build → Break → Fix) cycles.
  Use for 実験計画, マイクロチケット, 6分イテレーション, BIBIFI最大化, ETA/JST,
  idle RAM/VRAM/CPU, and ticket/agent lifetimes. Prioritizes the critical path, fills spare
  capacity with useful independent work, targets ~2-minute experiments and caps each at 10 minutes.
  Owns the rolling ITERATION_PLAN/LOG and scientific work selection within authorized scope.
  Admission→directing-research-sections; resource/dispatch mechanics→orchestrating-agents;
  evidence validity→validating-experimental-evidence; theory updates→systematizing-theories.
  Workflow-native: priorities and replanning stay solo; independent microtickets may run concurrently.
  English skill; respond in the user's language.
---

# Driving BIBIFI cycles

> **Version**: v2609.2.1 (2026-09-27) — microtickets bound exposure to invalidated premises.

```sh
for f in assets/ITERATION-PLAN.md references/microticket-patterns.md \
  tests/triggers.md tests/decision-cases.md tests/scheduling-cases.md \
  tests/forge-verification-ledger.md; do test -f "$f" || exit 1; done
bun ../forging-skills/scripts/skill-check.ts .
```

## LAW — break through the critical path; leave no useful capacity idle

> Produce a small verifiable artifact, test what could break it, then fix, retain or reject it from the evidence.
> Attack the earliest blocking dependency on the critical path first. Keep its next useful action moving.
> Actively turn spare capacity into goal-relevant progress; utilization alone earns no credit.
> Shorten the time from action to feedback to the next action. Do not end an execution request with a plan alone.
> Each finding may obsolete other work already running. Commit only to a microticket, then select again.

A completed cycle has an observed result, a justified decision and a reusable artifact or evidence locator.
A valid negative, a localized defect, or a retained implementation can close a cycle; a code change is not mandatory.
A ticket count, untested file, status message or restated blocker is not a completed cycle.
Never split bookkeeping into fake cycles or keep an easy side stream busy while the critical path waits.
Maximize completed cycles that change a decision or remove a delivery dependency, not raw cycle count.

Keep `BIBIFI`, `MICROTICKET`, `ITERATION_PLAN`, `ITERATION_LOG`, `ontime`, `delta` and `pivot` stable.

## Function and ownership

| Input | Action | Owned artifact / result |
|---|---|---|
| Authorized goal/work set, previous results and current resources | Slice and prioritize executable microtickets | Rolling `ITERATION_PLAN`: critical frontier, ready/blocked queue, resource use and ETA |
| Each result, release or new blocker | Close its BIBIFI loop and choose the next useful action | `ITERATION_LOG` entry and immediately revised queue |
| Six-minute boundary during the active session | Reconcile output, tickets, resources and schedule | Concise JST report in the required order |

Use existing tickets, run intents and findings; these names do not introduce a second record store.
Within a granted section, keep its admission, WIP and learning-commit rules. Other admitted work may run independently.
Wake the required owner on each receipt; do not add a global barrier or repeated user approval.
This skill chooses useful work and ordering; it does not grant new objectives, permissions or resource reservations.

## Start from the current state

Check the previous release schedule, completion criteria, open tickets and actual available RAM/VRAM/CPU.
Also inspect active jobs, reservations, GPU compute load and shared write/dependency conflicts.
Unknown values stay `未確認` / `UNKNOWN`; do not invent free memory, completion or launch receipts.
Use existing observations if still current, and refresh those that can change the next dispatch.
Identify the first goal-relevant result to land and the current bottleneck, then start the smallest ready cycle.

## Two clocks, one continuous loop

| Clock | Operating rule |
|---|---|
| Six minutes | Work toward a verifiable deliverable and a fresh allocation decision each window; report in JST every six minutes while active |
| One experiment | Target about two minutes; stop at ten minutes maximum, or a tighter task/resource cap |
| One microticket/worker | Set an explicit return deadline, stall trigger and finite lifetime; account for preparation, execution, interpretation and recording |

Six minutes is not permission to wait until the next report. Close and continue as soon as a result arrives.
A bounded experiment may cross a report boundary within its ten-minute cap; report it honestly and run independent work.
The experiment's wall clock includes its launched process startup/compilation; do not hide these outside the cap.
The microticket ETA includes preparation, queueing, integration, interpretation and record hand-back too.
Size the work so ordinary cycles return useful feedback inside the six-minute window.
If it cannot, change the slice, reuse valid preparation or choose a different discriminator before dispatch.
No sweep or large experiment belongs in this loop. Do not disguise a separately authorized larger study as microtickets.

## Make the ticket a complete small loop

| Step | Required action |
|---|---|
| Build | Choose one hypothesis or implementation question; create/reuse the smallest executable change or witness |
| Break | Before measurement, record baseline, control and criterion; run the smallest informative check, including relevant negative cases |
| Fix | Use the result to repair, retain, reject or narrow; verify any repair and choose the next conditional ticket |

Use a diagnostic expected-vs-observed contrast when there is no scientific rival; do not invent hypotheses for a form.
Choose the smallest scale that preserves the mechanism and separates outcomes with a justified margin.
An underpowered tiny run is not informative. An oversized registered suite is not the default unit of work.
Freeze only this ticket's changing conditions; inherit unchanged binding, controls and resource policy by exact locator.
Use the compact card in `assets/ITERATION-PLAN.md`. Add scientific detail only when it changes interpretation.
`references/microticket-patterns.md` shows runnable slices and result branches.

**Get a real path early.** Trace the intended input → named model/component → update → scoring/consumer.
Use a tiny target-path fixture to expose wrong dispatch, missing constructors and interface mismatches early.
Do not postpone first integration until every component, law layer or whole-suite gate is finished.
A contract is delivered when its intended consumer can use the checked interface, not merely when a document is written.
A diagnostic slice may establish routing or a boundary only; it is not evidence of full capability.

## Prioritize, reserve, fill and replan

For each dispatch decision, consult the ready queue and real resource/dependency state.

| State | Action now |
|---|---|
| Critical-path microticket is ready | Reserve its required resources and launch it first |
| Critical path is blocked | Give the smallest blocker-removal cycle an owner and deadline; continue useful independent ready work |
| RAM/VRAM/CPU remain after critical-path reservations | Launch another authorized useful independent microticket that fits all resources and does not delay the priority work |
| GPU waits on CPU preparation | Perform the preparation and use otherwise free GPU capacity for an independent informative check |
| Independent work could overrun the next critical-path need | Shorten it, reserve headroom or use a predeclared safe cancellation point; do not rely on a hopeful ETA |
| No useful admissible work fits | Inspect split/reuse/repair options; state the remaining reason for idleness and the next event that changes it |
| A result, failure, cancellation or resource release arrives | Reconcile immediately, free reservations, update priorities and dispatch the next ready ticket |

Not being on the critical path is not a reason to forbid useful independent work.
Spare capacity alone does not justify a ticket.
Before launch, name the decision it can change or the delivery dependency it can remove, with a checkable result.
Reject repeat measurements, cosmetic artifacts and speculative batches that cannot name either contribution.
If capacity is idle, search the current blocker, its successors and reusable preparation for another useful slice.
“No ready ticket” is a queue defect to investigate, not a sufficient reason to stop searching.
Do not manufacture work when none survives that check; record what was inspected and the actual limiting condition.
Resource concentration means protecting the priority path, not silencing every independent CPU/GPU stream.
Use actual load as well as memory: spare VRAM does not imply spare GPU compute or host RAM.
Give each compute job its RAM/VRAM/CPU/slot footprint. P7 in `orchestrating-agents` owns admission and limits.

## Wait only for the dependency this action needs

| Dependency | Treatment |
|---|---|
| Execution: callable interface, required input, authority, feasible envelope | Must hold for the proposed action; if missing, run a smaller authorized diagnostic/build cycle that supplies it |
| Interpretation: oracle applicability, baseline validity, CPU/GPU parity for a capability claim | Required for that claim; can be tested by a bounded diagnostic before global acceptance is complete |
| Promotion: whole-suite acceptance, broader generalization or release | Do not claim it early; it need not block a useful narrow BIBIFI experiment |

An interpretation gap is not a blanket execution ban. It is also not permission for a blind battery.
A provisional run must have a useful scoped interpretation and a prewritten next action even if the open check fails.
Dependent successors wait for the actual required result; fixed comparison arms and independent questions may overlap.
Never bypass a required project launcher, resource guard or explicit user constraint to keep a device busy.

## Bound work that the next finding could invalidate

Execution independence does not imply that a ticket's purpose survives another ticket's result.
For each microticket, cite its current premise/version and the result that would make further work pointless.
Choose a slice by time to useful feedback and time to safe cancellation, not only by its execution cap.
If a pending result could obsolete it before hand-back, shorten to a reusable slice or defer that dependent work.
Use the released capacity for another useful microticket; do not fill it with likely disposable work.
Long milestones may organize the goal, but all executable commitments are microtickets.
A ten-minute cap is a ceiling, not evidence that a ten-minute commitment is sensible.

| Event | Immediate action |
|---|---|
| A finding or authorized decision changes a shared premise | Match its changed premise/version to queued and running tickets; notify their owners now |
| A ticket loses its purpose or required premise | Cancel its remaining work through its owner, preserve partial evidence and confirm resource release |
| A ticket still serves the goal under unchanged premises | Continue without waiting for unrelated workers or a global acknowledgement |
| A microticket completes and has a preauthorized successor | Recheck the successor against current premises and priorities before starting it |

Do not let sunk effort, an old assignment or an unexpired deadline justify obsolete work.
Cancelled work keeps its original evidence binding; report discarded effort without inventing a scientific negative.
Owner-approved premise changes govern replanning; a worker's unsupported assertion grants no new authority.
If updates cannot reach a worker promptly, shorten its assignment to the next hand-back instead of granting a long queue.

## Device and lifecycle control

Use GPU for GPU-capable experiments. Record a concrete workload/resource reason for CPU use and its inference scope.
Honor stricter active user constraints; a ticket name such as “oracle” or “diagnostic” changes no executed workload.
If the GPU path is missing, prioritize its smallest usable build/test slice. Do not wait for a full port.
Reuse validated immutable references and bounded warm workers when they reduce time to feedback.
Charge resident memory and worker lifetime explicitly; reset experimental state between cases.

Each worker receives ticket(s), write-set, deadline, stop/hand-back conditions and authorized next branches.
Compute workers receive P7 resource envelopes. Other workers carry the applicable `NONCOMPUTE` declaration.
One short ticket normally needs one executor; keep it on an authorized finite queue when repeated setup would waste time.
Preauthorized branches still require the current-premise check above, but no redundant parent reply.
Reusing a warm worker preserves setup, not a stale assignment or an unconditional sequence of future tasks.
New scope, authority or compute needs go through the existing dispatch-amendment/resource contract.
Track sent, accepted, running, blocked and terminal states from receipts; sending instructions is not starting work.
At a deadline, stall or cap, inspect the phase and stop/cancel through the owner.
Preserve partial evidence and confirm release.
Terminate or hand back idle workers when their finite work/lifetime ends; no orphan jobs or indefinite reservations.

## Evidence closes the loop

Use `validating-experimental-evidence` for measurement validity, realized controls, footing and allowed claim scope.
Use `systematizing-theories` for the exact prediction version and changes warranted by the finding.
Do not promote a missing control, a failed instrument or a partial timeout to a scientific conclusion.
A diagnosed instrument failure can close its diagnostic question, with the observed failure and next repair recorded.
Keep refuted hypotheses and unexplained causes. Repair/retest uses a new binding, not a rewritten old criterion.
The next ticket comes from this result or a primary source; do not add work by guesswork or utilization alone.

## Six-minute report — outputs first

Report briefly in this order:

1. Artifacts and measured results since the last report, with the decision each closed.
2. Ticket states, actual blockers and worker lifetime/stop actions.
3. Next microtickets and RAM/VRAM/CPU allocations, peaks/releases and unused-capacity reasons.
4. Release ETA in JST against the previous schedule: `ontime`, `delta` or `pivot`, each with its rationale.

Use `ontime` when the release date is unchanged, `delta` when its date changes, and `pivot` when goal or approach changes.
No previous schedule means initial baseline, not `ontime`. Distinguish experiment return ETA from release ETA.
A delay alone is not a pivot. A missed return changes the plan; do not roll the ETA without intervention.
If nothing landed, say so, name the blocking phase and change the slice/allocation now where possible.
Do not fabricate output or relabel an old artifact to satisfy the cadence.

## Routing and execution model

Priorities, result interpretation and replanning stay SOLO; independent microtickets may run concurrently.
Use `orchestrating-agents` for dispatch/resource mechanics and worker lifetimes, including shared-state ownership.
Use `implementing-and-debugging` and the language owner to execute code changes.
`directing-research-sections` retains section admission and learning commits; programme allocation stays with its owner.
A costly irreversible commitment belongs to `acting-on-hypotheses`. This loop grants no adoption authority.
No harness → run the same ready queue serially with scoped receipts.

## Verification and history

| File | Use |
|---|---|
| `assets/ITERATION-PLAN.md` | Rolling board, compact ticket and completion record in the canonical system |
| `references/microticket-patterns.md` | Concrete BIBIFI slices, scheduling and anti-waiting examples |
| `tests/triggers.md` | Fire/no-fire and sibling boundaries |
| `tests/scheduling-cases.md` | Critical-path, spare-capacity, timing and lifetime regression cases |
| `tests/decision-cases.md` | Retained scientific-interpretation safeguards; not a second gate manual |
| `tests/forge-verification-ledger.md` | User correction, design replacement, review and verification receipts |
| `tests/postmortem-2026-09-27.md` | Historical first audit |
| `tests/postmortem-2026-09-27-followup.md` | Historical second audit |
| `tests/postmortem-2026-09-27-third.md` | Historical third audit |
