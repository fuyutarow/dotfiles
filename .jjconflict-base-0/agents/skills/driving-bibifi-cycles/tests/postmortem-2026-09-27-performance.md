# Postmortem — time caps, performance footing and learning semantics

Source: `593bb74b-5e76-4887-bc19-84e72ac05616/Pasted text.txt`, 1,102 lines, ending 17:47 JST.
SHA-256: `1bda016ff202e9a5da7a14bb602b9f1ec27ff2bcd35c4d9985daaa02d9786bf6`.
This is a frozen audit of user-supplied outward reports. Most earlier content overlaps the previous packet.
Reported measurements, causes and test outcomes are not independently reproduced here.
Novelty claims below concern the additional reported failure detail, not independent repetitions of the same incident.

## New evidence and limits

| Locus | Reported event | Audit finding |
|---|---|---|
| L872, L895–901 | Full FireOps test consumes GPU for thirty-plus minutes; worker exceeds sixty minutes against a thirty-five-minute deadline | Prompt deadline and process stop have diverged; suite label must not bypass the active loop's budget |
| L905–918 | All queue launches fail a snapshot file-count limit; params removed, one launch then succeeds | Classify prelaunch failure separately and repair on one fixture; retrying every arena is not useful scientific work |
| L969–975 | Batched updates justified by a historical record; equivalence test checks only each batch's first episode | This test cannot detect changed predictions on later shared-state items |
| L988–1001 | Kernel occupies98% of device time, JIT70–90seconds; large predicted speedups and50,000tokens/s target | Device share is not whole-run share; forecasts and acceptance targets need the same workload/boundary |
| L1014–1040 | mqar records635seconds; remaining three arenas continue, repairs wait for queue completion | A reported time beyond600seconds requires stop/start/cleanup reconciliation; it cannot simply be reported as compliant |
| L1044 | Entire batch predicts from pre-batch shared table, then learns in order | This changes the update protocol in general, even if future-label leakage is absent |
| L1053 | Reused FireOps primitive itself contains dominant O(V) work | Reuse does not certify current algorithm cost; inspect actual shape and invoked implementation |
| L1057–1102 | Prequential train+infer, frozen forward, cold/warm and internal positions/s mixed; target raised from50k to200k | These numbers do not yet support a common speedup ratio or an inherited acceptance threshold |

The audit cannot determine whether635seconds includes cleanup or time outside the process limit.
It therefore requires timestamp and effective-cap reconciliation, rather than inventing a failed runner mechanism.
Similarly, historical throughput numbers and Bayesian-mixture language are not certified by this audit.

## Concept split and consolidation

| Concept | Owner | Retired conflation |
|---|---|---|
| First partial return, useful next run, stop obsolete queue | driving-bibifi-cycles | A queue must finish before a repair may land |
| Installed process cap, test selection, cleanup receipt | orchestrating-agents P7 | Agent deadline or test-suite name enforces/exempts process walltime |
| Prediction-time information and equivalence | validating-experimental-evidence EV2 | No leakage or equal first episode proves sequential-equivalent batching |
| Throughput estimand and comparison axes | evidence EV3 | All quantities labeled tokens/s or positions/s are comparable |
| Stage cost, primitive choice and whole-run forecast | optimizing-julia-gpu-kernels | Fast historical primitive or device-only ratio proves current end-to-end speed |

No new skill is needed. The kernel skill consumes EV2/EV3 rather than defining a second learning-protocol contract.
Its performance gates reject the affected performance claim; BIBIFI owns which useful work proceeds next.
The default resource-envelope example is shortened; actual limits remain task-derived, not a universal constant.

## Minimal causal witness for batch semantics

Use shared state and two repeated-key observations. The first reveal changes the table used to predict the second.
Sequential predict/update may therefore differ from two predictions on a frozen pre-batch table.
Agreement on the first observation cannot settle this contrast. Neither does absence of unrevealed labels.
Check all required outputs/state transitions and batch partitions; if delay is intentional, version the protocol.
Independent reset episodes may batch without this shared-state dependency, subject to their own order checks.

## Frozen sequential fixture and expected actions

Fresh OLD/NEW arms receive events separately with no expected answers. OLD loads804ac2c; NEW loads current relevant manuals.
No real numerical job runs. Each return is a short next-action decision, not an implementation benchmark.

| Event | Supplied state | Required decision |
|---|---|---|
| E1 | Owned GPU test exceeds the declared600second process cap; agent deadline later; queued probes wait | Stop via owner, preserve partial evidence and verify effective cap/cleanup; test label/agentdeadline do not excuse it |
| E2 | Speed patch predicts whole shared-state batch then updates; only first-episode parity checked | Treat equivalence as unproved; use repeated-key later-item witness or version changed protocol |
| E3 | Faster kernel claim from98%device share; cold train+infer3tokens/s vs frozen-forward200k and internal positions/s | Separate workloads/timing units; obtain measured whole-run shares before forecast or threshold; no automatic all-arena replay |
| E4 | GPU full; sixteen useful disjoint source/proof/interface microtickets ready; sixteen free agent slots, host fits; compact returns available | Start useful agent work broadly and bound each return; serialize only compute/write dependencies, not the whole fleet |

Additional static cases: a30minute full suite becomes a bounded relevant testset; a635second report includes
timestamp reconciliation; snapshot setup failure yields no scientific trial; isolated reset episodes remain batchable;
valid evidence from an overrun is preserved separately from operation compliance; aGPUbudget miss does not freeze unrelated work.

## In-turn correction: massive parallelism serves discovery throughput

Additional source: attachment `19dcfa13-0d48-480c-b3ff-64909cf521da/Pasted text.txt`,585 lines.
SHA-256: `7794e3459d140eae8197b83bcd122ffe0213594ca815da3aa28008631266154b`.
The ending17:49 report assigns broad CM/TM work for18:05 and a primitive for18:10; JIT is projected to19:00.
It also reports two changes in one live FireOps file that cannot be committed separately.
Those observations do not establish that unlimited useful tasks exist, but they expose coarse assignments and write coupling.
The actor did stop the stale queue and propose a small actual-path fixture; those are useful corrections.
The remaining long assignments and shared-file coupling still limit independent discovery work.

The user explicitly reaffirmed massive parallel microtickets and the single objective:
“Maximizing the throughput of knowledge discovery from Experimental and Formal Methods”.
These instructions are authoritative, not inferred from the report author's own remedies.
Our earlier “reduce fan-out if the parent cannot consume” rule overweighted contraction.
Replace it with scalable structured returns, independent artifact consumption and throttling only actual blocked branches.
Separate agent slots from compute reservations. Preserve single live-file ownership while permitting isolated proposals.
Formal/source/counterexample work can progress while GPU phases wait. Real host/platform limits still apply.
One question per ticket means many independent tickets, not one global active question.
No automatic actor quota, speculative sweep, duplicate work or new objective follows from free slots.
