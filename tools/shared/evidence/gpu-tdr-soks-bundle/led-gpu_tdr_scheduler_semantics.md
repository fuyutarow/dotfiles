---
type: sok_claim_ledger
title: WDDM TDR scheduler semantics and CUDA error-code boundary — claim ledger
description: Claim-level evidence links, reversal conditions, and limits for the bounded WDDM TDR and CUDA error-code position
status: draft
sok_id: 01a15d52-dda9-77a8-94c0-ddd63d538306
sok_unit_id: 01a15d52-dda9-77a8-94c0-ddd7550fedf6
sources:
  - id: gpu-tdr-semantics-evidence
    resource: urn:uuid:01a15d52-dda9-77a8-94c0-ddd3fcbdb014
generated:
  by: process:gpu-tdr-semantics-source-distillation
  at: 2026-10-21T00:00:00+09:00
sok_authority_key: ledger/gpu_tdr_scheduler_semantics
---

# Claim ledger — WDDM TDR scheduler semantics and CUDA error-code boundary

| ID | Claim | Disposition | Evidence | Reversal condition | Limit |
| --- | --- | --- | --- | --- | --- |
| TDRSEM-001 | WDDM TDR is a scheduler preemption/completion mechanism with a documented default two-second period. | supported | `urn:uuid:01a15d52-dda9-77a8-94c0-ddd3fcbdb014#EVI-TDR-001` | An applicable official WDDM source defines TDR differently or revises the default. | Does not make two seconds an arbitrary CUDA-kernel, process, or guest-syscall wall-clock timeout. |
| TDRSEM-002 | `TdrDelay=2 s`, `TdrDdiDelay=5 s`, and `TdrLevelRecover=3` are documented defaults with distinct meanings. | supported | `urn:uuid:01a15d52-dda9-77a8-94c0-ddd3fcbdb014#EVI-TDR-002` | An applicable official registry-key source changes these definitions or defaults. | No effective host configuration or recovery is evidenced; the source does not recommend end-user/application adjustment. |
| TDRSEM-003 | `0x141` is an engine timeout and `0x117` is a GPU/adapter-hang category; successful desktop recovery has a documented Event Viewer message and diagnostic report. | supported-with-limitations | `urn:uuid:01a15d52-dda9-77a8-94c0-ddd3fcbdb014#EVI-TDR-003` | An applicable official WDDM source revises these categories or recovery behavior. | No universal numeric Event Viewer ID is established here; a local label needs original record material. |
| TDRSEM-004 | CUDA `700` is illegal address, `702` is launch timeout, and `719` is launch failure/device exception; `719` is not launch timeout. | supported | `urn:uuid:01a15d52-dda9-77a8-94c0-ddd3fcbdb014#EVI-TDR-004` | An applicable NVIDIA CUDA Runtime API source revises the error-code definitions. | A numeric CUDA error does not identify layer, root cause, or WDDM TDR occurrence. |
| TDRSEM-005 | The bounded source corpus cannot establish an incident's effective host settings, TDR occurrence, reset, root cause, or WSL `dxg` causal direction. | supported-with-limitations | `urn:uuid:01a15d52-dda9-77a8-94c0-ddd3fcbdb014#Evidence absence boundary` | A separately retained, incident-correlated evidence unit supplies the missing original host/guest records and supports a narrower claim. | This is an evidence-boundary conclusion, not evidence that the hypothesized cause is false. |
| TDRSEM-006 | An empty result from a particular retained event-log query cannot refute a TDR or other host fault without a mechanism-to-surface and retention guarantee. | supported-with-limitations | `urn:uuid:01a15d52-dda9-77a8-94c0-ddd3fcbdb014#Evidence absence boundary` | An applicable source plus retained configuration proves the mechanism must emit and remain retained in that exact queried surface. | It establishes only the narrow absence of a retained matching record in that query's surface and window. |
