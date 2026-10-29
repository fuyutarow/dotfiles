# GPU TDR semantics — primary-source limits

**Status:** completed from the supplied incident record and a bounded, primary-source
survey on 2026-10-21. This note makes no host query, runtime change, registry edit,
sampler invocation, or GPU trial.

## Conclusion

The supplied record is consistent with a GPU/driver-stack failure affecting guest work,
but it does **not** establish a Windows TDR, a host reset, or a WSL `dxg` causal path.
In particular, no captured WDDM event, dump, scheduler trace, or host/guest request
correlation identifies a cause. The proposed `WSL → dxg → host WDDM TDR/recovery → guest
CUDA failure/wait` sequence remains a hypothesis, not a finding.

## Claim table

| Class | Claim | Basis and bounded meaning | What it does not establish |
| --- | --- | --- | --- |
| Documented fact | WDDM's TDR timeout is a scheduler preemption/completion mechanism. | Microsoft says the scheduler tries to preempt a task; if it cannot complete or preempt it within the default two seconds, Windows diagnoses a frozen GPU. Quote: “The default timeout period in Windows is two seconds.” [WDDM TDR](https://learn.microsoft.com/en-us/windows-hardware/drivers/display/timeout-detection-and-recovery) | It is not a timeout for arbitrary wall-clock duration of every CUDA kernel, process, or guest syscall. Whether a particular workload is covered depends on the submitted work and platform path. |
| Documented fact | `TdrDelay` defaults to 2 s; it is the allowed delay of the scheduler preempt request. `TdrDdiDelay` defaults to 5 s and is the separate time for driver threads to leave. | [Microsoft's registry-key reference](https://learn.microsoft.com/en-us/windows-hardware/drivers/display/tdr-registry-keys) specifies both defaults and meanings. Quote: “The default value is 5 seconds.” | No value was read from the target host. Defaults cannot prove effective host configuration or that a TDR occurred. Microsoft also says these keys are for driver-development testing/debugging, not end-user or application manipulation. |
| Documented fact | `TdrLevelRecover (3)` is Microsoft's documented default initial recovery level. | The same [registry-key reference](https://learn.microsoft.com/en-us/windows-hardware/drivers/display/tdr-registry-keys) lists recovery as the default. | The actual target host's `TdrLevel` is unknown; no registry evidence was captured here. |
| Documented fact | WDDM distinguishes engine timeout `0x141` from GPU/adapter hang `0x117`. | Microsoft states that engine timeouts `0x141` do not count toward the GPU-hang count and may be promoted if recovery fails; its page calls `0x117` GPU hangs. [WDDM TDR](https://learn.microsoft.com/en-us/windows-hardware/drivers/display/timeout-detection-and-recovery) | This bounded source does not document that a Reliability Monitor label `LiveKernelEvent 141` or `117` is itself a particular event record, dump, or root cause. A retained label would support only the documented timeout category after the label-to-code is independently captured. |
| Documented fact | Successful desktop recovery logs an Event Viewer message and diagnostic report. | Microsoft says recovery logs the preceding “Display driver stopped responding and has recovered” message in Event Viewer. [WDDM TDR](https://learn.microsoft.com/en-us/windows-hardware/drivers/display/timeout-detection-and-recovery) | This survey found no primary Microsoft source assigning that message the numeric event ID `4101`. Therefore `Display/4101` may be used only as an explicitly captured local record, not as a source-verified universal proof of a TDR. Its absence is not proof that no host fault occurred. |
| Documented fact | CUDA code `700` is illegal-address; `719` is launch failure; `702`, not `719`, is launch timeout. | NVIDIA defines `cudaErrorIllegalAddress = 700` as invalid-address load/store and `cudaErrorLaunchFailure = 719` as an exception during kernel execution; it separately defines `cudaErrorLaunchTimeout = 702`. Quotes: “invalid memory address”; “An exception occurred on the device while executing a kernel.” [CUDA Runtime API 12.8, pp. 533–535](https://docs.nvidia.com/cuda/archive/12.8.0/pdf/CUDA_Runtime_API.pdf#page=533) | A numeric CUDA error alone does not identify the faulty layer, prove a WDDM TDR, or distinguish application memory misuse from system-specific causes. |
| Reported local observation | The supplied [GPU stall record](../GPU-STALL-20261021.md) reports guest D-state/dxg-wait observations and bounded Windows Event Log queries with no retained matching `Display`/`nvlddmkm` events at the incident interval. | This is evidence about the retained inputs and the named queries, not a new measurement by this run. | It cannot establish no host reset/TDR, no driver fault, no unlogged/overwritten event, or which request initiated the failure. It also cannot show that a guest dxg waiter caused any host event. |
| Causal hypothesis — unproven | A guest request may have crossed the WSL `dxg` boundary while a host WDDM timeout/recovery or other host-side failure made the guest CUDA path wait or fail. | The hypothesis is compatible with the reported guest symptoms and with WDDM/CUDA semantics above. There is no primary-source mechanism trace connecting this incident's guest request to a host scheduler event. | Do not attribute the incident to WSL, `dxg`, NVIDIA, Windows TDR, the application, or hardware. Do not change TDR settings in response to this note. |

## What the absence can refute

Given the supplied query recipes, an empty retained result can refute only this narrow
statement: **a matching event was retained in the queried channel/provider/ID and time
window at query time.** It does not refute a TDR or other fault, because the evidence lacks
an end-to-end guarantee that the mechanism must emit to that queried surface, that the
record was retained, and that the selected fields/provider identify the event. It cannot
refute an engine-only timeout, a recovery whose record was not retained, an unobserved
driver/firmware/hardware failure, or a guest-only/application failure.

Conversely, a captured `Display/4101`, `0x141`, or `0x117` would be evidence of the
documented class only after retaining the original provider, channel, timestamp, payload,
and (for LiveKernelEvent) the code/dump linkage. It would still not assign cause to a guest
PID or establish that WSL initiated it.

## Minimum discriminating evidence (read-only capture design; not executed)

To test the causal hypothesis without changing settings, retain one incident-correlated
bundle: guest process/TID and CUDA API error with monotonic timestamps; guest `dxg` wait
state; host Event Viewer provider/channel/record XML; any WER live-kernel report/dump
identifier; and host driver version. A common time base plus request identity (if the
platform exposes one) is required to distinguish correlation from causation. This is a
future capture specification, not authorization to run host controls or GPU work.

## Reusable source-distillation packet (for mandatory survey/SOKS follow-up)

```yaml
packet: gpu-tdr-semantics-20261021
scope: Windows WDDM TDR semantics and CUDA error-code interpretation
sources:
  - publisher: Microsoft
    url: https://learn.microsoft.com/en-us/windows-hardware/drivers/display/timeout-detection-and-recovery
    retrieved: 2026-10-21
    claims:
      - TDR is scheduler preemption/completion based; default timeout is two seconds.
      - 0x141 is an engine timeout; 0x117 is a GPU hang category; successful desktop recovery logs an Event Viewer message.
  - publisher: Microsoft
    url: https://learn.microsoft.com/en-us/windows-hardware/drivers/display/tdr-registry-keys
    retrieved: 2026-10-21
    claims:
      - TdrDelay default=2 s; TdrDdiDelay default=5 s; TdrLevelRecover=3 is default.
      - Registry keys are documented for driver-development testing/debugging, not end-user/application adjustment.
  - publisher: NVIDIA
    url: https://docs.nvidia.com/cuda/archive/12.8.0/pdf/CUDA_Runtime_API.pdf#page=533
    retrieved: 2026-10-21
    claims:
      - CUDA 700=illegal address; 702=launch timeout; 719=launch failure/device exception.
known:
  - WDDM semantics do not equate the two-second default with arbitrary CUDA kernel wall time.
  - CUDA 719 is not the CUDA launch-timeout code.
uncertain:
  - effective TDR configuration on the incident host
  - whether any host TDR/recovery occurred
  - mapping of any local LiveKernelEvent label to original event/dump material
  - causal direction and mechanism across WSL dxg
missing:
  - incident-correlated host event XML/dump and guest request/error trace
  - evidence that the queried event-log surfaces are exhaustive for the claimed mechanism
non_claims:
  - no host cause, driver defect, WSL defect, or runtime cause is established
  - no TDR/host setting change is recommended
```

