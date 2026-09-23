# Architecture decisions — T0

> **SOLE owner:** the T0 design section of the Tiger conformance ledger.
> Decision prompts are skill-supplied. They adapt the bounded SoK.

## Start from the affected system

Read the existing design and implementation before proposing a new topology.
For greenfield work, sketch components, data flow, durable state, and external effects.
Reuse an existing design locus; do not create a second architecture document.

Record only the workload facts that change a decision:

| Input | Record | If unknown |
|---|---|---|
| Workload | Operation mix, contention, burst size, payload size | Label estimates; name a measurement or contract to resolve them |
| Quality goals | Required correctness, durability, throughput, latency | Name the trade-off and who can settle it |
| State | Mutation owner, ordering rule, durability/acknowledgment boundary | Keep the affected decision open |
| Runtime | Scheduling, allocation, I/O and dependency constraints | Inspect the actual target, not the source database's runtime |
| Failure scope | Crash, timeout, overload, cancellation, duplicate, corrupt data | Select cases that threaten the declared consequence |

Safety, performance, and developer experience supply a starting priority.
An unmet requirement is not excused by reciting that order.
State the sacrificed property and the condition under which the choice must change.

## Decision lookup

Select relevant rows. This is not an exhaustive taxonomy of software architecture.

| Design question | Required decision | Implementation/check link | Copying trap |
|---|---|---|---|
| Where does mutable state live? | Name its component owner and the allowed writers | Constructor/API or transition locus; conflicting-update check | A single owner does not imply a single thread |
| Where must work be ordered? | Specify the serialization boundary and safe concurrency outside it | Scheduler/queue/commit locus; reordered or duplicate completion | Serial state updates do not prohibit concurrent I/O |
| What happens under overload? | Bound queued, in-flight, retrying, and retained work across the path | Admission/queue limits; burst and slow-consumer checks | A local queue limit can move unbounded work upstream |
| Who owns resource lifetime? | Choose startup reservation, bounded pools, or justified dynamic allocation | Allocation/release/cancellation locus; exhaustion and leak check | Startup reservation is not compile-time static storage |
| Which work belongs on the hot path? | Separate coordination, I/O preparation, and bulk computation where useful | Batch interface/prefetch locus; latency and work measurements | Bigger batches can violate latency requirements |
| What survives crash and retry? | Define effect, durable record, acknowledgment, replay, and reconciliation order | Persistence/idempotency boundary; crash-between-steps check | Retry alone does not provide exactly-once external effects |
| What must be reproducible? | Define logical or physical determinism and inject time/randomness/I/O as needed | Replay/simulation seam; same-input state comparison | Deterministic simulation is not absence-of-bugs proof |
| Which dependency may violate the contract? | Inspect allocation, blocking, failure, versioning, and recovery behavior | Adapter/library contract; boundary check | Zero dependencies is not a universal requirement |

For cross-component paths, trace at least one request from admission to completion or recovery.
Carry the resource reservation and state owner across each hop.
Name where ownership transfers and who cleans up after cancellation.

## One ledger section, no parallel authority

Add a design entry to the existing ledger:

```text
design_id:
scope / current_design_locus:
workload: observed facts | estimates | unknowns
components_and_flow:
state_owner_and_transition:
resource_and_failure_boundaries:
decision:
alternative_rejected:
tradeoff_and_applicability:
revisit_if:
obligation_ids:
status: proposed | checked | open
```

T1–T4 and obligation fields remain owned by `ledger-and-calibration.md`.
A design-only request may end with proposed decisions and planned checks.
Never label those checks as run or the system as release-ready.

For an existing narrow change, cite the current design and record only its affected boundary.
Do not force a full deployment or domain-model redesign to complete a local contract.

## Worked adaptation — a paid-job queue

This example is constructed; it is not TigerBeetle's architecture.

- Design D1: a durable job record owns state; worker completions carry a lease generation.
- Alternative rejected: workers independently write a boolean completion flag.
- Trade-off: lease validation adds state and recovery logic to reject stale completions.
- Obligation O1: after reassignment, an older generation cannot commit a completion.
- Check: suspend worker A, reassign to B, then deliver A's late completion.
- Separate check: establish whether the payment provider can deduplicate the effect.
- If not, record reconciliation and the remaining duplicate-charge risk; a lease alone is insufficient.

If O1 passes but duplicate external effects remain, reopen the external-effect boundary.
A passing local check does not close the whole request path.
