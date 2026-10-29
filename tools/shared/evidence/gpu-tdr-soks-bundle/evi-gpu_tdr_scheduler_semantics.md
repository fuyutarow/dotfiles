---
type: source_evidence
title: Windows WDDM TDR scheduler semantics and CUDA error-code boundary
description: Bounded primary-source observations on WDDM scheduler preemption, documented defaults, TDR categories, and CUDA errors 700, 702, and 719
status: draft
sok_id: 01a15d52-dda9-77a8-94c0-ddd3fcbdb014
sources:
  - id: microsoft-wddm-tdr
    resource: https://learn.microsoft.com/en-us/windows-hardware/drivers/display/timeout-detection-and-recovery
    title: WDDM support for timeout detection and recovery
  - id: microsoft-tdr-registry-keys
    resource: https://learn.microsoft.com/en-us/windows-hardware/drivers/display/tdr-registry-keys
    title: TDR registry keys
  - id: nvidia-cuda-runtime-api-12-8
    resource: https://docs.nvidia.com/cuda/archive/12.8.0/pdf/CUDA_Runtime_API.pdf#page=533
    title: CUDA Runtime API version 12.8, error-code reference pages 533-535
generated:
  by: process:gpu-tdr-semantics-source-distillation
  at: 2026-10-21T00:00:00+09:00
sok_locator: Microsoft WDDM TDR and TDR registry-key pages retrieved 2026-10-21; NVIDIA CUDA Runtime API 12.8 PDF pages 533-535
sok_capture: locus_only
sok_read_depth: partial
sok_read_scope: The supplied packet's named Microsoft WDDM TDR and registry-key pages and NVIDIA CUDA Runtime API 12.8 error-code loci only; no host, Windows, GPU, or runtime observation was performed.
---

# Capture

## Immutable evidence convention

This source-evidence document captures only the bounded primary-source loci named
in its frontmatter. Its `sok_id`, source records, and body are the immutable
evidence unit proposed for admission. The triad documents cite this capture by
its `urn:uuid` and must not reinterpret an absent host observation as source
evidence. Any correction requires a new evidence unit and a new proposal; it
does not silently rewrite this capture.

## EVI-TDR-001 — Scheduler-preemption semantics and default period

Microsoft describes timeout detection and recovery (TDR) as a graphics-scheduler
preemption/completion mechanism. The scheduler tries to preempt execution; if it
cannot complete or preempt the task within the documented default two-second
period, Windows diagnoses a frozen GPU. This is not documentation that every
CUDA kernel, process, guest syscall, or arbitrary wall-clock wait has a
two-second timeout. Applicability to an individual workload depends on submitted
work and platform path.

## EVI-TDR-002 — Documented settings defaults and recovery level

Microsoft documents `TdrDelay` with a default of two seconds as the delay for a
scheduler preempt request. `TdrDdiDelay` is a separate driver-thread-exit delay
with a default of five seconds. `TdrLevelRecover (3)` is the documented default
initial recovery level. The same source limits these registry keys to driver
development testing and debugging, not end-user or application manipulation.
These are source defaults, not an observation of any host's effective registry
configuration and not evidence that a recovery occurred.

## EVI-TDR-003 — Timeout categories and recovery record boundary

Microsoft distinguishes an engine timeout `0x141` from a GPU/adapter hang
`0x117`: engine timeouts do not count toward the GPU-hang count and can be
promoted if recovery fails. Microsoft also states that successful desktop
recovery logs its documented recovery message in Event Viewer and creates a
diagnostic report. The bounded packet contains no source that assigns that
message a universal numeric Event Viewer ID such as `4101`; a captured local
label would require its original provider, channel, timestamp, payload, and any
report/dump linkage before it can be classified.

## EVI-TDR-004 — CUDA error-code meanings

NVIDIA's CUDA Runtime API 12.8 defines error `700` as illegal address, `702` as
launch timeout, and `719` as launch failure caused by an exception while a
kernel executes. Thus `719` is not the launch-timeout code. A CUDA numeric error
alone does not identify a faulty layer, establish a WDDM TDR, or distinguish
application memory misuse from system-specific causes.

## Evidence absence boundary

No host registry value, display event, WER report, dump, scheduler trace,
guest/host request correlation, GPU experiment, or runtime result is captured
by this evidence unit. An empty retained result from a particular local query
can establish only that no matching record was retained in that queried surface
and time window; it cannot establish that no TDR or other fault occurred.
