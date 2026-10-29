---
type: sok_protocol
title: WDDM TDR scheduler semantics and CUDA error-code boundary — protocol
description: Bounded primary-source distillation protocol for WDDM TDR semantics, defaults, categories, and CUDA errors 700, 702, and 719
status: draft
sok_id: 01a15d52-dda9-77a8-94c0-ddd535c0796b
sok_unit_id: 01a15d52-dda9-77a8-94c0-ddd7550fedf6
sources:
  - id: gpu-tdr-semantics-evidence
    resource: urn:uuid:01a15d52-dda9-77a8-94c0-ddd3fcbdb014
generated:
  by: process:gpu-tdr-semantics-source-distillation
  at: 2026-10-21T00:00:00+09:00
sok_authority_key: protocol/gpu_tdr_scheduler_semantics
---

# Protocol — WDDM TDR scheduler semantics and CUDA error-code boundary

## Review mode and supplied corpus

This is a supplied, bounded primary-source distillation dated 2026-10-21. The
corpus is exactly the official Microsoft WDDM TDR page, Microsoft TDR registry
key page, and NVIDIA CUDA Runtime API 12.8 error-code loci identified in the
source packet. No additional source discovery, host query, Windows query, GPU
trial, or runtime test was performed.

## Coverage contract

The unit may state only source-defined scheduler-preemption semantics,
documented default values and recovery categories, CUDA error-code meanings,
and the evidentiary limits that follow from their scope. It may not convert a
documented default into an effective host setting, a category into a current
event, a CUDA code into a root cause, or a compatible guest-to-host narrative
into a proven causal mechanism.

## Capture and synthesis convention

The evidence role uses `locus_only`: it retains named public resources, observed
date, and exact page/section scope rather than presenting a source summary as a
verbatim quotation. The position is a synthesis of those observations; the
ledger gives each synthesis claim its evidence link, reversal condition, and
limit. The proposed four-role unit shares one unit ID, while the evidence
capture remains immutable after admission. A correction is a new capture and
new proposal, not an alteration of admitted evidence bytes.

## Counterevidence and absence limits

No novelty claim is made. The supplied bounded corpus was not expanded with a
mechanism-synonym or literature-completeness search. No source in this corpus
establishes that a specific Event Viewer numeric ID universally denotes the
documented recovery message. Nor does this corpus establish that any queried
event-log surface is exhaustive. Therefore missing local records remain
`not reported` for this knowledge unit, not evidence against a TDR or another
host fault.

## Structural omissions

The protocol structurally omits host-effective registry state, event XML,
report/dump linkage, driver and firmware state, scheduler traces, guest/host
correlation, WSL `dxg` transport details, application memory behavior, and
runtime experiments. Those omissions prevent incident attribution and causal
direction claims without contradicting the bounded documented semantics.
