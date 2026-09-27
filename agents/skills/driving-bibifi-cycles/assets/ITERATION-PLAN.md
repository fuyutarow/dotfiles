# Rolling ITERATION_PLAN and ITERATION_LOG

Use the existing ticket/run/finding system. Reuse unchanged context by locator; do not copy this into a parallel database.
A small task can keep this inline. The board is revised on events, not only at report time.

## Shared context — establish once, refresh when changed

- Goal and completion condition: <authorized target and exact acceptance question>
- Previous release ETA (JST): <schedule or initial baseline>
- Current window: <start -> next six-minute report, JST>
- Critical frontier: <first decision/deliverable that unlocks the goal>
- Binding/validation context: <code, input, runner, controls and evidence-owner records; unresolved scope named>
- Resources now: <available and reserved RAM/VRAM/CPU/slots, actual GPU load; UNKNOWN if unmeasured>
- Priority reservation: <resources needed by current/next critical ticket and when>
- Worker/launcher policy: <existing authority, envelope and lifecycle references>

## Ready and blocked queue

| Ticket / owner | Goal contribution / priority | BIBIFI deliverable and current phase | Required dependency / state | RAM / VRAM / CPU / slots | Return ETA / lifetime | Authorized next branch |
|---|---|---|---|---|---|---|
| <id> | <decision changed or delivery dependency removed; critical or independent> | <artifact + informative check + fix decision> | <execution / interpretation / promotion; receipt> | <phase footprint/envelope or NONCOMPUTE> | <JST; finite stop/hand-back> | <result -> next ticket> |

Independent tickets may use spare capacity even when they are not on the critical path.
For idle resources, record the blocker/successor/preparation slices inspected and the remaining limiting condition.
If a row cannot produce useful feedback promptly, change the slice instead of merely extending its ETA.

## Compact MICROTICKET

```text
ID / OWNER / CONTEXT: <ticket, sole executor, shared-context version/locators>
QUESTION / DELIVERABLE: <one hypothesis or implementation question; smallest verifiable output>
BUILD -> BREAK -> FIX: <minimal change/witness -> test with baseline/control/criterion -> repair/retain/reject branches>
DEPENDENCIES: <execution/claim needs; premise versions; pending result that would make this work obsolete>
FIT / LIMITS: <whole-cycle cost; compute: P7 envelope + device reason; NONCOMPUTE: declaration>
RETURN / NEXT: <deadline; invalidation/stall stop and release; successor conditional on current premises>
```

Before measurement, fix its baseline, control, criterion and tested binding, directly or by exact reference.
For a numerical prediction, cite its oracle scope and uncertainty through the evidence/theory records.
Experiment target: about two minutes. Maximum: ten minutes or a tighter active cap, including launched setup/compile.
The full microticket ETA also includes preparation, integration and recording. Six-minute windows aim for useful closures.
Changed conditions get a new ticket/run revision; never retrofit the old criterion.
On a premise-changing finding, revisit affected running tickets as well as the queue immediately.
Choose hand-back and safe cancellation points before pending results could render the whole assignment useless.

## Completion in ITERATION_LOG

```text
TICKET / BINDING / RECEIPT: <exact IDs and executed version>
OBSERVED / DECISION: <result + evidence disposition/scope -> fixed, retained, rejected, narrowed or blocked>
ARTIFACT: <checked code/result/source locator; a status message alone is not a BIBIFI closure>
COST / RELEASE: <actual phase times + discarded effort; compute: peaks/release; NONCOMPUTE: N/A + hand-back>
NEXT: <start authorized successor / re-slice blocker / stop; update the board now>
```

## Six-minute JST report

1. Artifacts + measured results + decisions closed.
2. Ticket states + blockers + lifetime actions.
3. Next tickets + RAM/VRAM/CPU plan, actual peaks/releases, and any remaining idle-resource reason.
4. Release ETA: previous -> current JST, `ontime` / `delta` / `pivot`, rationale; initial baseline if none existed.
