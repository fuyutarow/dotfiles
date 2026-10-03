# Research control

This directory contains the deterministic V0 checking floor for the research-control harness.
[ARCHITECTURE.md](ARCHITECTURE.md) is the canonical owner of topology, component dispositions,
and adoption decisions; this README is the entrypoint to the implemented checker surfaces.
[SEARCH-LEARN-THROUGHPUT-POSTMORTEM.md](SEARCH-LEARN-THROUGHPUT-POSTMORTEM.md) records the structural
failure and its bounded evidence status.

No live engine, provider, hook, broker, or scientific run is activated. Scientific progress is
currently `SEARCH=0` and `LEARN=0`.

## V0 checkers

- `trace.ts` validates one section trace: exact Goal → Programme Snapshot → OPEN_ISSUE → Mandate →
  Charter → Grounding authority lineage, explicit known-result disposition, bounded lease/time,
  immutable role grants, exact pre-action/receipt/learning joins, measurement-valid evidence,
  receipt-linked scale release, and the terminal exact-blocker branch.
- `programme-flow.ts` validates programme-level streaming: independent section dispatch,
  section WIP=1 across SEARCH through commit, current programme and per-section Goal/Grounding
  authority, typed grounded-search or Section-admission authorization on every job, dependency
  readiness, minimal-before-scale release, resource-slot backpressure, forbidden global/hot-path
  waits, replay fences, and metrics derived only from valid section traces.
- `learning-bus.ts` validates lateral committed learning: the exact source commit, immutable
  subscriptions, deterministic delivery, recipient admission and local transfer commit,
  replay/idempotency fences, visibility, and propagation-only metrics.

These checkers validate structure and deterministic joins. They do not execute research, make
scientific judgments, or supply a durable runtime.

## Verification

```sh
bun test agents/research-control agents/skills/directing-research/tests agents/skills/forging-skills/tests
```

The 2026-08-04 acceptance run passed 180 tests and 460 expectations. This is a local deterministic
floor, not evidence of live hook enforcement or scientific SEARCH/LEARN.

## CLI contract

```sh
bun agents/research-control/cli.ts <trace.json>
```

The CLI checks the `research-section-trace/v2` wire and writes exactly one JSON result envelope
to stdout. A domain pass exits `0`; typed findings exit `1`. Cleye help exits `0`, while a missing
positional argument or unknown flag exits `1`. An unreadable or invalid JSON path is caught at
the entry boundary, writes one `FATAL:` line to stderr, and exits `2`.

## Trace wire

The wire requires an explicit RFC3339 `evaluatedAt`, `ACTIVE|TERMINATED` status, a bounded lease,
one immutable grant per actor, and strictly time-ordered events with unique IDs. Roles and event
kinds are closed. Its top-level authority exactly joins the signed Goal Constitution, Programme
Snapshot, OPEN_ISSUE, SECTION_MANDATE, SECTION_CHARTER, and current GROUNDING_PACKET before a valid
candidate can enter.

Only a current-grounded, explicitly classified
`CANDIDATE_PACKET -> ADMISSION -> EXECUTABLE_SPEC -> INTENT` chain releases the deadline and WIP;
every ID and SHA-256 join is exact. Receipt and learner chains require the same exact digest joins.
Only measurement-valid `PASS` observations can earn scientific SEARCH or support scientific LEARN.
Evidence must be tracked, nonignored, and SHA-256-addressed.

An executor-authored `EXACT_BLOCKER` must join a prior valid intent. It is the sole terminal
branch for a terminated exact-blocker lease and permits neither later search nor an implied
SEARCH or LEARN claim.
