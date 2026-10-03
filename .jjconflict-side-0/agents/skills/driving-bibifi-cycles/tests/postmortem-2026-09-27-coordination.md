# Postmortem — delegation without microticket coordination

Scope: frozen user-supplied outward reports from Firedancer, ending at 15:13 JST.
Source: attachment `03163da7-b27e-41bd-9508-4fee29345130/Pasted text.txt`, 1,428 lines.
SHA-256: `63a3697a430da04f2be1fe4ef03a2352a78f380e5ebb6676c3737609d8c587b2`.
This audits the reported control plane. It does not reproduce code, runs, resource peaks or theorem claims.
Earlier overlapping reports are not independent incidents. Missing reports do not prove no private action occurred.

## Failure and evidence

The parent repeatedly assigned whole components, waited for hand-back, and changed ETAs instead
of closing short integration/decision loops. Calling the assignments microtickets did not change their scope.

| Source locus | Observation | Control-plane failure / supported limit |
|---|---|---|
| L210–239 | 13:47 component split; interfaces due 13:57, components 14:20–14:30, integration 14:45 | File ownership became the scheduling unit; no early consumed end-to-end slice is specified |
| L976–1004 | Seven tickets and no learner result; idle capacity declared justified by missing SelfMixer; six-ticket minimum cited | Ticket count substitutes for parent intervention on the blocking dependency |
| L1047 | “I'll act when it hands back” while runner waits for its background run | Explicit passive parent posture, without phase/partial-artifact intervention |
| L1051–1065 | Parent says the added SelfMixer instruction was refused, unnoticed until 14:19; reissued 14:23 | Reported failure to distinguish sent instruction from accepted execution; mechanism of message refusal is unverified |
| L1174–1242 | Reports move from 14:38 to 15:00; same critical repair remains and E1 moves to 15:10 | Supplied reports contain a 22-minute reporting gap and a rolled ETA; no changed short return is shown |
| L1266–1329 | Broad SelfMixer repair called a microticket; active run counted to reach six; sequence smoke includes several arenas | Label/count inflation and broad work persist after adopting BIBIFI vocabulary |
| L1335–1371 | Target gate reports placeholders and failures; replacement type due 15:45 | Earlier gate delivery did not establish target conformance; new dispatch still uses a distant whole-part return |
| L1375–1428 | Parent reports Q16 invalidates count-table tuning; live assignments still include CM repair, Q17, full LLU and gates with returns 15:25–15:45 | Changed premise requires explicit continue/shrink/stop decisions. The reports do not show those decisions for all affected live work |

The reported “16 findings, only one useful” is the actor's retrospective assessment, not an
independently measured throughput statistic. Q16's reported ceiling is not certified by this audit.
It is enough here that the parent accepted it as changing the next engineering decision.

## Skill design responsibility

The failure is not adequately explained by workers being slow. The manuals allowed the parent
to treat dispatch, deadlines and eventual acceptance as sufficient coordination.

| Existing weakness | Repair / owner |
|---|---|
| Orchestration allowed a single implementation assignment under twenty minutes | Remove that permission; C0 requires first checkable return, consumer and parent intervention point |
| Component-size thresholds could be read as permission below the threshold | Explicitly make them additional alarms; domain microticket cadence takes precedence |
| Long-run instruction said stop only after final report | Replace with return points and deadline/invalidation/stop precedence; no BIBIFI cap escape through background execution |
| BIBIFI named invalidation but did not make parent coordination observable | Parent retains current blocker, latest artifact and next decision; each consequential event joins to a parent action |
| A whole component could be relabeled microticket | Require a small consumed result, including for implementation work; milestones are containers only |
| Useful side findings hid unattended critical work | Such findings cannot excuse coordination failure; reduce fan-out if the parent cannot consume returns |

Strict consequence: an applicable intervention without a decision/action record fails delegation
operation. Later success does not retroactively pass it. Repeated failure requires processing
unconsumed returns and shrinking the assignment, not repeating the same brief with a later ETA.
This judges the parent; valid evidence remains valid and is not discarded as punishment.

No new mandatory human approval, global barrier, agent quota or state database is introduced.
The parent consumes current evidence and makes scoped decisions; workers retain authorized local autonomy.

## Concrete replacement for the last reported situation

At Q16 acceptance, inspect which ongoing repairs remain useful. Cancel table-tuning work whose
goal is now unattainable; retain a key-construction diagnostic only if it still serves a named decision.
Separate the unchanged-history replay defect into its own bounded witness/repair if independently useful.
Ask Q17 first for one located SP mechanism and a discriminating fixture, not an entire mechanism study.
Ask the conformance owner for one executable failed criterion with a negative fixture, then consume it.
Ask the LLU owner for the smallest interface witness that addresses that criterion before a full type rewrite.
Freeze actual read/write bindings before any concurrent probe; unfinished shared files are not immutable input.
Do not infer the scientific answer or invent how long these steps take. Set the next short return from actual readiness.

The first missing artifact reopens the parent's split/dispatch decision immediately. Independent useful
work continues within resource limits; no fleet-wide stop is implied by one affected premise.
