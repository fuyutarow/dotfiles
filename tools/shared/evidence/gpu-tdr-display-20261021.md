# RTX 3060 active-display topology evidence — 2026-10-21

## Outcome

**UNKNOWN.** This collection did not obtain an active display-path binding to
the RTX 3060. It does not report that no display is attached.

## Observed facts

- The authorized, foreground Windows topology collection invoked the following
  read-only API sequence through PowerShell `Add-Type` interop:
  `GetDisplayConfigBufferSizes(QDC_ONLY_ACTIVE_PATHS = 0x00000002)`, then
  `QueryDisplayConfig(QDC_ONLY_ACTIVE_PATHS)`. The intended successful-path
  metadata calls were `DisplayConfigGetDeviceInfo` for source, target, and
  adapter names, plus `EnumDisplayDevices(source)`.
- The exact Windows process wrapper was:

  ```sh
  timeout 25s /mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe \
    -NoProfile -NonInteractive -Command "$windows_ps"
  ```

  `$windows_ps` was the in-memory PowerShell `Add-Type` topology-query script;
  it made no setting, driver, GPU-compute, NVIDIA, NVML, CUDA, or registry write.
- `GetDisplayConfigBufferSizes` returned successfully. `QueryDisplayConfig`
  returned result **5**, after which the script stopped before it could emit any
  active path, source adapter binding, or monitor metadata. Its raw relevant
  output was:

  ```text
  QueryDisplayConfig failed: 5
  At line:44 char:60
  + ... ]::ERROR_SUCCESS) { throw "QueryDisplayConfig failed: $queryResult" }
  +                         ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
      + CategoryInfo          : OperationStopped: (QueryDisplayConfig failed: 5:String) [], RuntimeException
      + FullyQualifiedErrorId : QueryDisplayConfig failed: 5
  ```

- The local post-query receipt timestamp was `2026-10-21T16:14:30+09:00`.
  The failed Windows command did not emit its own capture timestamp; this receipt
  timestamps recording immediately after the completed foreground invocation.
- The prior `GPU-STALL-20261021.md` contains Windows registry display-class
  metadata naming an NVIDIA GeForce RTX 3060. That is installed/historical
  device metadata, not an active-display attachment observation.

## Coverage limit

No active-path array was returned. Consequently this record has **no observed
active path count**, **no source-to-adapter binding**, and **no monitor name or
other monitor metadata**. The registry input cannot fill those fields. Windows
event logs were not queried in this collection because they do not establish
the requested active topology binding.

## Causal boundary

This result neither supports nor refutes a TDR, a GPU stall, a driver fault, or
any causal connection between display attachment and the prior incident. It
only records that this bounded active-topology query did not yield data.

## Scope and disposition

No runtime or host setting was changed. No recovery action, signal, restart,
reset, sampler invocation, `nvidia-smi`, NVML, CUDA, Julia, CIM video-controller
query, driver probe, or additional topology query was performed. No tool release
change, changeset, CHANGELOG entry, fixture, or version decision is needed for
this evidence-only record.
