# Retrospective — contention and budget inflation

Source: attachment1657a2a5-d279-49c4-b258-44692a95c7d3,801lines;
SHA2567742d86dbd756d781a62a78cb4601881afe95513a353a0892e875b6907393844.
Baseline dotfiles c73e58a. Exported outward reports are evidence of the actor's reports, not a full execution trace.
Exact historical loaded skill version, per-job peaks and matched solo/concurrent rates remain unverified.

| Source lines | Observation | Finding |
|---|---|---|
| 1–7,185–206 | First returns scheduled15–20minutes out, broad repair due45minutes later | The first useful-return unit was not kept inside the six-minute feedback window |
| 341–387 | Three literature-protocol jobs estimated90, then177minutes each; walltime increased3h→6h | Direct conflict with the user's ten-minute experiment cap; ETA substituted for budget authority |
| 399–409 | Small retrying jobs could take capacity before the preferred4.5GiB job | Admission races, not priority coordination; later pausing retry loops was corrective |
| 490–511 | Reported204tok/s versus earlier1150–1250; one long run stopped and RELEASE confirmed | Severe estimate mismatch; matched conditions are unverified, so concurrency's causal share is not quantified |
| 519–569 | GPU25% used to justify another long job; CPU jobs then occupied the released host reservations | Utilization substituted for decision latency and joint resource headroom |
| 781–800 | Obsolete/redundant work stopped; five jobs retained | Useful correction, but no evidence that retained experiments now satisfy the ten-minute cap |

Physical RAM was repeatedly reported free by26–35GiB. Do not call this demonstrated physical
RAM exhaustion or swap pressure. Reservation contention and VRAM admission blocking are explicit;
CPU/host contention is reported but load average alone does not prove its mechanism.
Positive discoveries and proper RELEASE handling remain valid evidence; the episode was not devoid of learning.

## Root-signed correction and ownership

BIBIFI owns useful work selection, inherited experiment budgets, decision latency and re-planning.
P7 owns inspection of the actual envelope, process stop/release and feasibility admission.
Reject an envelope above the ticket's effective cap before admission. Preserve that cap across
retries/resumes; change the question or experiment design instead of quietly increasing duration.
Admission is not a throughput certificate. Protect the next critical resource bundle; reduce
conflicting compute on unexpected slowdown while continuing independent useful agent work.
Queue deadlines are absolute; polling is bounded and returns to the parent on expiry.

No new scheduler, schema or runtime enforcement is claimed. The current runner validates a declared
walltime in1..86400seconds and stops at that value; it does not independently derive the user's cap.
This instruction revision requires explicit comparison and records that enforcement gap.
The independently changed8-job policy remains unchanged; the stale P7 hardcoded4 was replaced by
a pointer to effective policy. Neither ceiling is an optimal-concurrency measurement.

## Frozen verification criteria

Static cases S61–S69 cover budget inflation, tighter inherited limits, retries, contention, queue
starvation, reservation/physical-memory distinction and runtime-policy drift.
A fresh worker receives the current skill and an isolated ticket/resource fixture without these answers.
It must inspect actual files, write a scoped launch/hold decision and preserve invalidated work as data.
No live compute, source-project writes, job cancellation or resource-policy mutation is allowed.
This checks a tool-backed prelaunch decision only, not runtime rejection of a dishonest envelope
or actual throughput improvement. Read back the produced artifact and report any failure.
