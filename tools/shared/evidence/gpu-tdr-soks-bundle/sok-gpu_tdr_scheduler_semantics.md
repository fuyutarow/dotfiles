---
type: sok_position
title: WDDM TDR scheduler semantics and CUDA error-code uncertainty boundary
description: Bounded position on scheduler-preemption TDR semantics, documented defaults, CUDA errors 700, 702, and 719, and the limits of incident attribution
status: draft
sok_id: 01a15d52-dda9-77a8-94c0-ddd4fb36f074
sources:
  - id: gpu-tdr-semantics-protocol
    resource: urn:uuid:01a15d52-dda9-77a8-94c0-ddd535c0796b
  - id: gpu-tdr-semantics-ledger
    resource: urn:uuid:01a15d52-dda9-77a8-94c0-ddd63d538306
  - id: gpu-tdr-semantics-evidence
    resource: urn:uuid:01a15d52-dda9-77a8-94c0-ddd3fcbdb014
generated:
  by: process:gpu-tdr-semantics-source-distillation
  at: 2026-10-21T00:00:00+09:00
sok_unit_id: 01a15d52-dda9-77a8-94c0-ddd7550fedf6
sok_authority_key: sok/gpu_tdr_scheduler_semantics
---

# WDDM TDR scheduler semantics and CUDA error-code uncertainty boundary

## Research question

What do the bounded official sources establish about Windows WDDM TDR as a
scheduler-preemption mechanism, its documented defaults and categories, and the
meaning of CUDA errors `700`, `702`, and `719`; what remains unknown about an
individual incident's host state or causal path?

## Position

### Known

- WDDM TDR is documented as a scheduler preemption/completion mechanism with a
  default two-second timeout period. This does not make two seconds a universal
  wall-clock deadline for arbitrary CUDA work or guest waiting.
- `TdrDelay` defaults to two seconds for the scheduler preempt request;
  `TdrDdiDelay` defaults to five seconds for driver threads to leave; and
  `TdrLevelRecover (3)` is the documented default initial recovery level. These
  values are development/debugging controls, not a recommendation to alter an
  end-user or application system.
- WDDM distinguishes engine timeout `0x141` from GPU/adapter hang `0x117`.
  Successful desktop recovery is documented to log a recovery message and
  diagnostic report, but this corpus does not source-verify a universal numeric
  Event Viewer ID for that message.
- CUDA `700` means illegal address, `702` means launch timeout, and `719` means
  launch failure/device exception. In particular, CUDA `719` is not CUDA launch
  timeout.

### Uncertain

- The effective TDR configuration, recovery state, and any event/dump material
  on an individual host are not established by the source defaults.
- Whether a host TDR, a host reset, another driver/hardware failure, an
  application error, or a guest-only condition occurred in an incident is not
  established here.
- A proposed guest request → WSL `dxg` boundary → host WDDM TDR/recovery →
  guest CUDA wait/failure sequence is a causal hypothesis only. This unit has no
  correlated request identity or mechanism trace and asserts no causal direction.
- A locally captured `Display/4101`, `0x141`, or `0x117` label requires original
  record material before it can support its documented category; it would still
  not identify the initiating guest request or root cause by itself.

### Missing

- Incident-correlated host event XML, WER live-kernel report or dump identifier,
  driver version, and guest process/TID, CUDA error, and `dxg` wait observations
  on a common time base are absent from this corpus.
- Evidence that particular event-log channels, providers, IDs, fields, and
  retention policies exhaustively expose the mechanism of interest is absent.
- Independent semantic review and runtime or host evidence are absent.

## Reversal conditions

This position changes if an applicable official source revises the stated WDDM
or CUDA definitions, or if a separately retained incident-correlated evidence
unit supplies original host/guest records that support or rule out a narrower
causal claim. Source defaults alone cannot satisfy that second condition.

## Coverage boundary

This is a supplied, bounded primary-source distillation dated 2026-10-21. It
covers only the named Microsoft WDDM TDR and registry-key pages and NVIDIA CUDA
Runtime API 12.8 error-code loci. It makes no literature-completeness claim;
contains no host query, Windows/GPU/runtime trial, registry read, or current
incident assertion; and does not recommend a TDR setting change.
