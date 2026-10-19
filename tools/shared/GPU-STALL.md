# WSL GPU stall RCA (2026-10-19)

## Finding

The immediate failure is in the WSL GPU-PV `dxg` guest/host request path: GPU callers are blocked waiting for adapter-lock acquisition or a VMBus completion, while repeated `dxgvmb_send_sync_msg` requests fail to complete. This is strongly supported by the guest evidence. The underlying cause of the host-side noncompletion is **not established**. The evidence does not distinguish a Windows NVIDIA driver defect, a WSL `dxgkrnl` defect, or a GPU/host state left unhealthy by earlier work. A CUDA fault, resource pressure, and NVML probing remain possible triggers or contributors, but none is established as the cause.

## Hypothesis under test: pause sampler probes during admitted GPU work

At 18:53 JST on Oct 19, the WSL dxg path failed again with
`dxgvmb_send_sync_msg: wait_for_completion failed`, followed by
`dxgkio_query_adapter_info: Ioctl failed: -512`. Only one GPU job was admitted:
firedancer pe-selcopy (Julia PID 4190016, alive in futex wait), with slot
`gpu.0.0` held by scope-controller PID 4189924. The process observed in D state
was the sampler's own `nvidia-smi` (PID 45850, wait channel
`dxgvmb_send_sync_msg`, query `adapter_info`). Earlier the same day, a stalled
research process waited on `dxgglobal_acquire_process_adapter_lock` while the
sampler's `nvidia-smi` waited in `dxgvmb_send_sync_msg`.

The best-supported working hypothesis is that an NVML `query_adapter_info`
issued while a CUDA job is active can remain blocked on this host, with other
GPU callers then queued behind it. This is not established as the root cause.
The mitigation under test is for the sole NVML caller (`gpu-sampler`) to inspect
the agent-resource GPU slot locks and skip `nvidia-smi` whenever any slot has a
live holder. A paused cycle records `na: true` and
`why: "probe paused: GPU job admitted"`, preserves the last successful sample
timestamp, and does not count as a probe miss or stall; sampling resumes on the
first cycle after slots are free. This tests whether sampler probes during
admitted work contribute to the observed dxg blockage; it cannot prove the
underlying driver fault is fixed.

## Captured state

- `/proc/version`: `6.18.54.1-microsoft-standard-WSL2` (build date shown there: 2026-10-06).
- Windows NVIDIA driver package at `/usr/lib/wsl/drivers/nv_dispig.inf_amd64_cc526ccc3287f5cd/nv_dispig.inf`: `DriverVer = 07/22/2026, 32.0.16.1088`. This is the package INF version/date, not a live query of the Windows driver service.
- `dmesg` has recurring `misc dxg: dxgk: dxgvmb_send_sync_msg: wait_for_completion failed: fffffe00`, followed by `dxgkio_escape` or `dxgkio_query_adapter_info: Ioctl failed: -512`, and later `process_completion_packet: did not find packet to complete`. The pattern appears on Oct 18 and Oct 19. On Oct 19, entries occur at 15:50, 15:52, 15:55, 15:57, 16:01, 16:07 and 16:13 JST; the 16:13 entry is `dxgkio_destroy_allocation: Ioctl failed: -512`. Earlier days also contain the same signature. The first captured entry follows the reported ~15:48 incident by about two minutes, so this is temporal correlation, not proof of the initiating event.
- At 16:14:29 JST, read-only `/proc` inspection showed Julia PID 1961980 in `D` state at `dxgglobal_acquire_process_adapter_lock`; `nvidia-smi` PID 2024107 in `D` at `dxgvmb_send_sync_msg`; and `nvidia-smi` PID 2098653 in `D` at `dxgglobal_acquire_process_adapter_lock`. Julia PID 1952041 was `Z` (defunct). These wait channels localize the blocked callers to dxg adapter coordination / guest-host message completion, but do not reveal what the Windows host is doing.
- `/home/fuyu/.local/state/gpu-owner.json` records `unresponsiveSince`, six consecutive sampler starts finding `nvidia-smi` still running, 12,288 MiB total, and a last captured use of 4,323 MiB. Its process list records PIDs 1952041 and 1961980 but has null per-process memory. This is a stale/last-known sample, not simultaneous peak usage evidence.
- The supplied admission declaration for `pe3-khop` is present and declares `vram_peak_bytes: 7516192768` (7 GiB). The specified `pe1-memo/resource.json` was absent at inspection, so its declaration could not be independently checked in this run. The two 7 GiB declarations and 12 GiB physical capacity stated in the incident imply declared demand of 14 GiB, but reservations are not measurements of actual resident/used memory.
- `journalctl -k` listed the current boot but returned no kernel entries for the requested period; its access hint says messages from other users are hidden. The `dmesg` ring buffer did provide the dxg records above. Windows event logs and a live driver query were subsequently collected; see **Windows host evidence** below. `/proc/driver/nvidia/version` is absent in this WSL guest.

## Assessment of proposed explanations

| Candidate | Evidence-based disposition |
|---|---|
| (i) Two concurrent jobs over-committed VRAM | **Declared-budget overcommit is supported** if both reported 7 GiB peaks were admitted concurrently: 14 GiB declared against 12 GiB capacity. **Actual VRAM overcommit as the cause is not demonstrated.** The last sampler record reports 4,323 MiB used and cannot capture the earlier peak; no per-process usage or Windows residency/budget trace is available. Microsoft documents WDDM residency budgets and that they can vary with pressure; reservations alone do not establish physical residency or an allocation failure. |
| (ii) CUDA fault 719 poisoned a context; its unreaped zombie held the adapter lock | The incident report supplies a 719 followed by PID 1952041 becoming a zombie, and another Julia process is observed waiting on the dxg adapter lock. NVIDIA documents 719 as a device exception that leaves that process inconsistent and says terminate/relaunch it before further CUDA work. **The zombie itself continuing to hold the adapter lock is unsupported:** it is observed as a terminated (`Z`) task, not as a live waiter. No evidence shows that kernel-side driver state attributable to it survived process exit. A separate live process is blocked in dxg. Whether teardown left orphaned host/driver state is unknown; the available records do not prove a causal link from the 719. |
| (iii) NVML probing during context teardown | **Plausible, not demonstrated.** `nvidia-smi` itself is observed blocked in dxg, and the sampler records that it remained running. Neither establishes that an NVML probe began during teardown or that probing initiated the underlying stall. The sampler's [operations note](GPU-SAMPLER.md) says whether polling triggers a WSL driver deadlock remains unverified. |
| (iv) Driver or WSL version bug | **A WSL GPU-PV/dxg path defect is the best-supported fault domain, but a version-specific bug is not proven.** Repeated guest-host completion failures and D-state wait channels directly implicate the dxg path. Public reports in Microsoft's WSL issue tracker describe the same `dxgvmb_send_sync_msg` failure and D-state waits, but those reports are not confirmation by Microsoft of a defect or of this machine's root cause. Windows System records now independently show NVIDIA FECS exceptions at 16:06:56–16:07:25 JST, overlapping the 16:07 guest failure, followed by an NVIDIA GPUID error. These establish coincident host GPU errors, not a TDR/reset. The live driver is 32.0.16.1088 and WSL is 3.0.3.0 (kernel 6.18.54.1-1); no reset event, fix-version comparison, or controlled version change establishes which component/version is faulty. |

## Relevant documented behavior

- NVIDIA's CUDA Runtime API defines `cudaErrorLaunchFailure` (719) as a device exception during kernel execution; it leaves the process inconsistent, subsequent CUDA work returns the same error, and the process must be terminated and relaunched. This supports context poisoning within the failing process, not a claim that a zombie continues holding an adapter lock.
- NVIDIA's CUDA-on-WSL guide documents WSL constraints, including partial NVML query support and limitations around managed and pinned system memory. It does not identify the observed wait-channel signature as a known, confirmed driver bug.
- Microsoft describes WDDM TDR as GPU scheduler timeout detection and recovery, with a default two-second timeout and a driver reset/recovery path. The Windows collection below found no Display 4101 or explicit reset/recovery record for Oct 18–19; TDR involvement remains unconfirmed. Guest `-512` messages and NVIDIA error IDs alone do not establish a TDR.
- Microsoft's WDDM residency documentation describes per-process residency budgets that can change under memory pressure. This means declared peaks exceeding nominal capacity are an admission-risk signal, not proof those bytes were concurrently resident or that WDDM overcommit caused this dxg stall.
- Microsoft's GPU paravirtualization documentation describes guest-host GPU communication over VMBus, consistent with the observed `dxgvmb_send_sync_msg` path. Microsoft's WSL issue tracker contains user reports of similar hangs, which are useful symptom matches but not vendor-confirmed root-cause findings.

## What remains unknown

The host-side request or lock that failed to complete; whether an unlogged Windows TDR or driver reset occurred (none is established by the event collection below); actual per-job and host-wide VRAM residency at the incident peak; whether NVML entered during CUDA teardown; whether the 719 preceded or caused the dxg fault rather than coinciding with it; and which driver/kernel/WSL component or version contains the defect. Resolving those requires additional Windows-side trace evidence and synchronized per-process GPU-memory telemetry. `journalctl -k` did not expose the kernel records in this run.

## Sources

- NVIDIA, [CUDA Runtime API error types (`cudaErrorLaunchFailure`)](https://docs.nvidia.com/cuda/cuda-runtime-api/group__CUDART__TYPES.html).
- NVIDIA, [CUDA on WSL User Guide](https://docs.nvidia.com/cuda/wsl-user-guide/).
- Microsoft, [WDDM support for Timeout Detection and Recovery](https://learn.microsoft.com/en-us/windows-hardware/drivers/display/timeout-detection-and-recovery).
- Microsoft, [Driver residency in WDDM 2.0](https://learn.microsoft.com/en-us/windows-hardware/drivers/display/driver-residency-in-wddm-2-0) and [Process residency budgets](https://learn.microsoft.com/en-us/windows-hardware/drivers/display/process-residency-budgets).
- Microsoft, [GPU paravirtualization](https://learn.microsoft.com/en-us/windows-hardware/drivers/display/gpu-paravirtualization).
- Microsoft WSL repository reports (symptom reports, not confirmed diagnoses): [#41701](https://github.com/microsoft/WSL/issues/41701) and [#41682](https://github.com/microsoft/WSL/issues/41682).

## Windows host evidence

Collected read-only through `powershell.exe -NoProfile -Command` on host R99 on
2026-10-19 at 16:19–16:20 JST. Windows reports `Tokyo Standard Time` (UTC+09:00).
The event comparison interval is **2026-10-18 00:00:00 through 2026-10-19
16:20:07 JST**, inclusive; events after that cutoff are outside this capture.
No Windows settings, registry values (including TdrDelay), log enablement, or
process state were changed. No CUDA work or GPU probe was run.

**Result: a TDR or driver reset is not established at any listed stall.** There
are coincident NVIDIA errors at the 16:07 stall, but their payloads do not say
that a reset occurred. Absence of a matching event is evidence about these
retained logs, not proof that a TDR/reset could not have occurred.

### Live versions

`Get-CimInstance Win32_VideoController` returned:

| Field | Value |
|---|---|
| Name | NVIDIA GeForce RTX 3060 |
| DriverVersion | 32.0.16.1088 |
| DriverDate (ISO local rendering) | 2026-07-22T09:00:00.0000000+09:00 |

This independently agrees with the package INF captured above. `wsl.exe
--version` returned the following (its UTF-16 output is transcribed here):

```text
WSL version: 3.0.3.0
Kernel version: 6.18.54.1-1
WSLg version: 1.0.79
MSRDC version: 1.2.7391
Direct3D version: 1.611.1-81528511
DXCore version: 10.0.26100.1-240331-1435.ge-release
Windows version: 10.0.26300.9550
```

### Log coverage and exact query errors

System's oldest retained event was 2026-10-03T19:09:42.0246979+09:00,
record 9924729. In the comparison interval, System contained 108 `nvlddmkm`
records: 106 ID 13 and two ID 153 (13 records on Oct 18, 95 on Oct 19).
Every one is listed below. Counts refer to event records, not independent
stalls, resets, or affected processes.

| Query | Result |
|---|---|
| System / nvlddmkm, Oct 18–19 interval | 108 records; rendered `Message` is null for every record; XML EventData supplies the text below. |
| System / Display, all IDs (therefore including 4101), Oct 18–19 interval | No matching events. |
| System / Microsoft-Windows-WHEA-Logger, Oct 18–19 interval | No matching events. |
| System / Microsoft-Windows-DxgKrnl | Provider/log mismatch, not a successful empty query; its actual channels were queried separately. |
| Microsoft-Windows-DxgKrnl-Admin | Enabled, zero retained records; no matching events. |
| Microsoft-Windows-DxgKrnl-Operational | Enabled, 526 retained records, oldest 2025-07-21T10:16:51.3366573+09:00 (record 1), newest 2026-10-15T23:18:08.8578187+09:00 (record 526, ID 455, successful virtual GPU opening); no matching events in the Oct 18–19 interval. |
| DxgKrnl /Diagnostic, /Performance, /Power, /Contention; DxgKrnl-SysMm /Performance, /Debug | Channel discovery returned disabled with null record counts; these were not enabled or treated as negative event evidence. |

The initial slash-form `Microsoft-Windows-DxgKrnl/Admin` and
`Microsoft-Windows-DxgKrnl/Operational` metadata and read attempts each returned,
respectively, these exact errors:

```text
There is not an event log on the localhost computer that matches "Microsoft-Windows-DxgKrnl/Admin".
There is not an event log on the localhost computer that matches "Microsoft-Windows-DxgKrnl/Operational".
FullyQualifiedErrorId: NoMatchingLogsFound,Microsoft.PowerShell.Commands.GetWinEventCommand
```

`Get-WinEvent -ListLog '*DxgKrnl*' -Force` and
`(Get-WinEvent -ListProvider Microsoft-Windows-DxgKrnl).LogLinks` disclosed the
actual hyphen-form names used above. The System/DxgKrnl attempt returned:

```text
The specified providers do not write events to any of the specified logs.
FullyQualifiedErrorId: LogsAndProvidersDontOverlap,Microsoft.PowerShell.Commands.GetWinEventCommand
```

The Display, WHEA, hyphen-form Admin, and hyphen-form Operational interval
queries each returned:

```text
No events were found that match the specified selection criteria.
FullyQualifiedErrorId: NoMatchingEventsFound,Microsoft.PowerShell.Commands.GetWinEventCommand
```

The empty Admin oldest-event query returned the same error. Separate System
queries without a start bound also found no Display or WHEA records anywhere
in the retained System history (same `NoMatchingEventsFound` error). An initial
unbounded nvlddmkm query counted 50,324 retained records; the inventory below is
deliberately bounded to Oct 18–19, the dated incident coverage in this RCA.

The interval queries used this filter, once per System provider and once per
actual DxgKrnl channel (omit ProviderName for the latter):

```powershell
Get-WinEvent -FilterHashtable @{
  LogName = 'System'
  ProviderName = 'nvlddmkm' # also Display, Microsoft-Windows-DxgKrnl,
                           # Microsoft-Windows-WHEA-Logger
  StartTime = [datetime]'2026-10-18T00:00:00'
  EndTime = [datetime]'2026-10-19T16:20:07'
} -ErrorAction Stop
# Channel LogName values:
# Microsoft-Windows-DxgKrnl-Admin
# Microsoft-Windows-DxgKrnl-Operational
# Inspect TimeCreated.ToString('o'), ProviderName, Id, RecordId, Message;
# when Message is null, inspect ToXml() and Properties for EventData.
```

### Alignment with guest stalls

The guest's already-recorded minute times remain the primary incident anchors.
A fresh `dmesg --time-format iso | awk '/dxg/ {print}'` supplied the seconds
below. These are guest failure-report times, not measured GPU timeout onset.
The current ring no longer exposes Oct 18 or earlier dates, and the original
RCA gives no individual times for those dates; exact historical alignment
cannot be reconstructed from the supplied artifact.

| Guest dxg failure, JST | Windows evidence in the collected interval | TDR/reset disposition |
|---|---|---|
| Oct 19 15:50:12.484973 (15:50) | No matching host-provider event near this time; first NVIDIA event today is 16:06:56.2508702. | No logged TDR/reset identified. |
| Oct 19 15:52:51.055877 (15:52) | No matching host-provider event near this time. | No logged TDR/reset identified. |
| Oct 19 15:55:27.266141 (15:55) | No matching host-provider event near this time. | No logged TDR/reset identified. |
| Oct 19 15:57:48.844986 (15:57) | No matching host-provider event near this time. | No logged TDR/reset identified. |
| Oct 19 16:01:41.878801 (16:01) | No matching host-provider event near this time. | No logged TDR/reset identified. |
| Oct 19 16:07:20.061120 (16:07) | 94 nvlddmkm ID 13 FECS exceptions from 16:06:56.2508702 to 16:07:25.6692311; ID 153 GPUID error at 16:07:25.6702911. Nearest ID 13 is 16:07:20.0133763, about 48 ms before the guest report. | Coincident host GPU errors established; TDR/reset unconfirmed. Neither payload explicitly reports recovery/reset. |
| Oct 19 16:13:42.506367 (16:13; destroy_allocation follows) | No matching host-provider event near this time; last NVIDIA event is 16:07:25.6702911. | No logged TDR/reset identified. |
| Oct 19 12:13:17.904860, 12:28:07.936023, 12:59:55.630524, 13:19:20.020282, 14:33:22.857552, 14:36:00.902872 (additional earlier failures visible in the fresh ring) | No NVIDIA events before 16:06:56 today; no Display/WHEA or DxgKrnl Admin/Operational events in the comparison interval. | No logged TDR/reset identified for each of these six times. |
| Oct 18, individual guest times not preserved in the original RCA | 13 NVIDIA records listed below, including an ID 153 GPUID error at 18:12:55.4541299; no Display/WHEA or DxgKrnl Admin/Operational events. | No explicit TDR/reset record identified; exact coincidence is unknown without the missing guest times. |
| Earlier days (before Oct 18), dates/times unspecified in the original RCA | No retained System Display/WHEA event; the unbounded NVIDIA count is not an event-by-event historical alignment. System history before Oct 3 19:09:42 is unavailable in this capture. | Unknown per historical stall; neither a reset nor its absence at an unspecified time can be asserted. |

### Every matching event in the Oct 18–19 interval

All records below are in System. Local timestamps include UTC+09:00.
`Message = null` is the actual PowerShell result, not an omitted description.
The text after it is the event's two XML EventData strings, preserved as a
fallback because message rendering was unavailable. ID 153's GPUID error
is not relabeled as a reset.

| Local time (JST) | Provider | ID | Record ID | Message / XML EventData fallback |
|---|---|---|---|---|
| 2026-10-18T15:34:43.7250592+09:00 | nvlddmkm | 13 | 9978866 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-18T15:34:51.4938079+09:00 | nvlddmkm | 13 | 9978867 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-18T15:41:27.9239279+09:00 | nvlddmkm | 13 | 9978868 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-18T18:12:55.4541299+09:00 | nvlddmkm | 153 | 9978870 | Message = null; EventData: \Device\Video4 / Error occurred on GPUID: 100 |
| 2026-10-18T18:23:58.8351334+09:00 | nvlddmkm | 13 | 9978871 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-18T18:28:25.5507044+09:00 | nvlddmkm | 13 | 9978872 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-18T18:36:02.4455285+09:00 | nvlddmkm | 13 | 9978873 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-18T18:37:48.3312159+09:00 | nvlddmkm | 13 | 9978874 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-18T19:47:38.6378796+09:00 | nvlddmkm | 13 | 9978878 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-18T19:47:38.8519547+09:00 | nvlddmkm | 13 | 9978879 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-18T19:47:39.2958179+09:00 | nvlddmkm | 13 | 9978880 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-18T19:47:39.8023410+09:00 | nvlddmkm | 13 | 9978881 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-18T20:39:05.3002901+09:00 | nvlddmkm | 13 | 9978898 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:06:56.2508702+09:00 | nvlddmkm | 13 | 9978970 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:06:56.4782727+09:00 | nvlddmkm | 13 | 9978971 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:06:56.7067162+09:00 | nvlddmkm | 13 | 9978972 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:06:56.9382655+09:00 | nvlddmkm | 13 | 9978973 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:06:57.6037404+09:00 | nvlddmkm | 13 | 9978974 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:06:57.8215418+09:00 | nvlddmkm | 13 | 9978975 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:06:58.0430360+09:00 | nvlddmkm | 13 | 9978976 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:06:58.2731747+09:00 | nvlddmkm | 13 | 9978977 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:06:58.7239600+09:00 | nvlddmkm | 13 | 9978978 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:06:59.1707863+09:00 | nvlddmkm | 13 | 9978979 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:06:59.3871326+09:00 | nvlddmkm | 13 | 9978980 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:06:59.6012346+09:00 | nvlddmkm | 13 | 9978981 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:06:59.8316667+09:00 | nvlddmkm | 13 | 9978982 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:00.0655541+09:00 | nvlddmkm | 13 | 9978983 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:00.7178010+09:00 | nvlddmkm | 13 | 9978984 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:01.1635081+09:00 | nvlddmkm | 13 | 9978985 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:01.3904088+09:00 | nvlddmkm | 13 | 9978986 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:01.6301144+09:00 | nvlddmkm | 13 | 9978987 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:01.8558283+09:00 | nvlddmkm | 13 | 9978988 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:02.0951389+09:00 | nvlddmkm | 13 | 9978989 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:02.5699664+09:00 | nvlddmkm | 13 | 9978990 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:02.7948051+09:00 | nvlddmkm | 13 | 9978991 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:03.2491805+09:00 | nvlddmkm | 13 | 9978992 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:03.4837651+09:00 | nvlddmkm | 13 | 9978993 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:03.7249377+09:00 | nvlddmkm | 13 | 9978994 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:03.9622682+09:00 | nvlddmkm | 13 | 9978995 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:04.2020535+09:00 | nvlddmkm | 13 | 9978996 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:04.4412676+09:00 | nvlddmkm | 13 | 9978997 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:04.6732577+09:00 | nvlddmkm | 13 | 9978998 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:04.9013905+09:00 | nvlddmkm | 13 | 9978999 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:05.1318720+09:00 | nvlddmkm | 13 | 9979000 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:05.5950197+09:00 | nvlddmkm | 13 | 9979001 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:05.8307298+09:00 | nvlddmkm | 13 | 9979002 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:06.0468618+09:00 | nvlddmkm | 13 | 9979003 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:06.2700153+09:00 | nvlddmkm | 13 | 9979004 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:06.7582712+09:00 | nvlddmkm | 13 | 9979005 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:07.0097633+09:00 | nvlddmkm | 13 | 9979006 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:08.0412176+09:00 | nvlddmkm | 13 | 9979007 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:08.2870129+09:00 | nvlddmkm | 13 | 9979008 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:08.5337300+09:00 | nvlddmkm | 13 | 9979009 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:08.7775197+09:00 | nvlddmkm | 13 | 9979010 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:09.5049518+09:00 | nvlddmkm | 13 | 9979011 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:10.0115440+09:00 | nvlddmkm | 13 | 9979012 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:10.4954134+09:00 | nvlddmkm | 13 | 9979013 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:10.9920638+09:00 | nvlddmkm | 13 | 9979014 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:11.2402232+09:00 | nvlddmkm | 13 | 9979015 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:11.4906926+09:00 | nvlddmkm | 13 | 9979016 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:11.9825608+09:00 | nvlddmkm | 13 | 9979017 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:12.2291865+09:00 | nvlddmkm | 13 | 9979018 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:12.4686022+09:00 | nvlddmkm | 13 | 9979019 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:12.7115923+09:00 | nvlddmkm | 13 | 9979020 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:13.4019647+09:00 | nvlddmkm | 13 | 9979021 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:13.6327658+09:00 | nvlddmkm | 13 | 9979022 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:13.8648945+09:00 | nvlddmkm | 13 | 9979023 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:14.0993689+09:00 | nvlddmkm | 13 | 9979024 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:14.3420578+09:00 | nvlddmkm | 13 | 9979025 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:14.5800249+09:00 | nvlddmkm | 13 | 9979026 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:14.8130502+09:00 | nvlddmkm | 13 | 9979027 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:15.0517440+09:00 | nvlddmkm | 13 | 9979028 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:15.2829291+09:00 | nvlddmkm | 13 | 9979029 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:15.7418175+09:00 | nvlddmkm | 13 | 9979030 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:15.9749462+09:00 | nvlddmkm | 13 | 9979031 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:16.1997628+09:00 | nvlddmkm | 13 | 9979032 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:16.4315589+09:00 | nvlddmkm | 13 | 9979033 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:16.6574851+09:00 | nvlddmkm | 13 | 9979034 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:16.8861493+09:00 | nvlddmkm | 13 | 9979035 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:17.1180606+09:00 | nvlddmkm | 13 | 9979036 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:17.5559722+09:00 | nvlddmkm | 13 | 9979037 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:17.7757615+09:00 | nvlddmkm | 13 | 9979038 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:18.4139409+09:00 | nvlddmkm | 13 | 9979039 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:18.6338360+09:00 | nvlddmkm | 13 | 9979040 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:18.8647565+09:00 | nvlddmkm | 13 | 9979041 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:19.1009381+09:00 | nvlddmkm | 13 | 9979042 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:19.5415120+09:00 | nvlddmkm | 13 | 9979043 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:19.7783442+09:00 | nvlddmkm | 13 | 9979044 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:20.0133763+09:00 | nvlddmkm | 13 | 9979045 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:20.2446379+09:00 | nvlddmkm | 13 | 9979046 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:20.4797622+09:00 | nvlddmkm | 13 | 9979047 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:20.7161422+09:00 | nvlddmkm | 13 | 9979048 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:20.9608232+09:00 | nvlddmkm | 13 | 9979049 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:21.1978562+09:00 | nvlddmkm | 13 | 9979050 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:21.4329290+09:00 | nvlddmkm | 13 | 9979051 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:21.6646771+09:00 | nvlddmkm | 13 | 9979052 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:22.1283644+09:00 | nvlddmkm | 13 | 9979053 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:22.3530155+09:00 | nvlddmkm | 13 | 9979054 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:22.5824808+09:00 | nvlddmkm | 13 | 9979055 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:22.8160063+09:00 | nvlddmkm | 13 | 9979056 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:23.0274490+09:00 | nvlddmkm | 13 | 9979057 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:23.2574646+09:00 | nvlddmkm | 13 | 9979058 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:23.4871766+09:00 | nvlddmkm | 13 | 9979059 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:23.7129452+09:00 | nvlddmkm | 13 | 9979060 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:23.9422194+09:00 | nvlddmkm | 13 | 9979061 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:24.1608476+09:00 | nvlddmkm | 13 | 9979062 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:25.6692311+09:00 | nvlddmkm | 13 | 9979063 | Message = null; EventData: \Device\Video4 / Graphics FECS Exception: Logging error 0x2 |
| 2026-10-19T16:07:25.6702911+09:00 | nvlddmkm | 153 | 9979064 | Message = null; EventData: \Device\Video4 / Error occurred on GPUID: 100 |
