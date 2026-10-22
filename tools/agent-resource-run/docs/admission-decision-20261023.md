# GPU admission decision — 2026-10-23

## Decision and purpose

Keep responsibilities R1–R4 in the current integration. The bounded primary-source comparison found useful primitives in existing schedulers, but no complete replacement under the target WSL2, user-scope and daemon-handoff constraints. These are integration decisions, not runtime benchmark results. The full evidence ledger, comparison matrix, per-responsibility verdicts, standalone assessment and unverified items are in [the dated OSS survey](oss-survey-20261023.md).

| Responsibility | Failure it is intended to prevent | Decision and evidence |
|---|---|---|
| R1: per-device job slots | Too many concurrent admitted job scopes for a device. This is an admission count, not a process or CUDA-context limit. | **keep** — reviewed queue and scheduler options require adapters or do not establish arbitrary per-device slots; existing per-device flock pools already supply the local primitive. See survey matrix and R1 decision [T0, T1, S1, Y1, G1]. |
| R2: summed declared VRAM plus margin | Admitting declared concurrent peaks whose sum exceeds the configured device budget. This is advisory reservation accounting, not physical runtime VRAM enforcement. | **keep** — gpusched is the closest reuse candidate and Ray can model the arithmetic, but either requires one admission authority, a manifest adapter and proven reservation retention through descendant cleanup. WSL/scope behavior remains unmeasured [Y1, G1, G2]. |
| R3: cooperative daemon yield/resume | Research starts while the embedding daemon still owns a CUDA context or VRAM, or the daemon resumes before research releases ownership. | **keep** — the reviewed tools do not document the required batch drain, context destruction, and later resume handshake [S1, Y1, M1, G1]. |
| R4: refusal on persistent D-state plus dxg wait | A new job is admitted while a GPU-related task remains blocked in a persistent dxg wait. A single observation is insufficient to establish persistence. | **keep as local policy** — reviewed sources do not establish a rootless persistent dxg admission gate. Detection accuracy is unmeasured, so this verdict does not establish that the detector is reliable [W1, W3, M1, D1]. |

The comparison does not show that “nothing existing can do this”: Ray models both logical dimensions, gpusched reserves declared VRAM plus a margin, and current MPS documentation describes device-memory cgroup limits. These do not establish the complete target integration. See the [full ledger](oss-survey-20261023.md#challenges-limitations-and-unverified-items).

## Refusal-history finding

No durable history of GPU admission decisions was found in the inspected sources. There were no `DENY GPU` journal entries in the queried user-journal range since 2026-10-14, and runtime files were only volatile snapshots. The refusal record therefore recovered zero DENY lines; that count is not zero actual refusals. The share of real stalls among refusals is **unmeasurable** from the available record. Source and coverage details are in accepted agx run `9ced8f08`.

## Incidents and repairs

| Evidence | Incident and outcome |
|---|---|
| agx run `e550a00a` | A sampled row named the embedding daemon’s just-yielded GPU worker as an unverifiable holder and caused refusal. The guard was fixed to exclude a yielded worker only while holding the handoff lock. A subsequent consumer run recorded ADMIT. |
| agx run `33bf84d0` | An unrelated root-owned `systemd-journald` process briefly in D state with an unreadable wait channel caused refusal. The guard was fixed to require positive GPU evidence. A subsequent consumer run recorded ADMIT. |
| agx run `9ced8f08` | A real dxg stall, with wait channel `dxgvmb_send_sync_msg` at approximately 02:26–02:28 JST on 2026-10-23, was correctly refused. The refusal-history review did not recover its underlying DENY line; see its coverage limits above. |

## Open work

1. Durably record every GPU admission decision, including admission and refusal, with enough context to audit its reason and evidence.
2. Define a type contract for GPU-tie evidence and ensure every refusal branch persists that evidence. This makes “positive GPU evidence” explicit and auditable.
3. Trial gpusched on WSL for R2, measuring integration with the target scope lifecycle and reservation ownership before considering replacement.
4. Treat R4 as an experimental standalone detector only after measured accuracy, including false-denial rate, missed-stall rate and detection latency across representative healthy waits, actual stalls and evidence failures. No numeric acceptance threshold is established by the survey.

## Evidence boundary

The OSS comparison is a bounded documentation review, not candidate execution, compatibility certification, or proof of source-code absence. The refusal-history finding describes only inspected sources. The incident repairs and outcomes above are cited by accepted agx run IDs; the run IDs identify evidence records and do not supply a durable admission history. Unverified items remain listed in the [survey](oss-survey-20261023.md#challenges-limitations-and-unverified-items).
