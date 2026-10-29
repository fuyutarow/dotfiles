# GPU TDR registry evidence — 2026-10-21

## Scope and outcome

One completed, read-only query inspected only
`HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers` values `TdrDelay`,
`TdrDdiDelay`, and `TdrLevel`. It changed no registry, runtime, host, permission,
driver, or GPU API state.

The key was available. At the capture instant, none of the three named values existed.
This is an observed name-list result; it is not an access-denied result.

## Observed facts

| Item | Observation |
| --- | --- |
| Capture UTC | `2026-10-21T07:13:23.0108017Z` |
| Capture JST | `2026-10-21T16:13:23.1475972` (`Tokyo Standard Time`) |
| Key availability | `key_available: true` |
| `TdrDelay` | `exists: false`; value and kind not applicable |
| `TdrDdiDelay` | `exists: false`; value and kind not applicable |
| `TdrLevel` | `exists: false`; value and kind not applicable |

Raw completed-query output (exit `0`):

```json
{"key_available":true,"path":"Registry::HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers","utc":"2026-10-21T07:13:23.0108017Z","jst":"2026-10-21T16:13:23.1475972","timezone":"Tokyo Standard Time","values":[{"name":"TdrDelay","exists":false,"value":null,"kind":null},{"name":"TdrDdiDelay","exists":false,"value":null,"kind":null},{"name":"TdrLevel","exists":false,"value":null,"kind":null}]}
```

## Exact completed command and error receipt

The command ran in the foreground through the bounded interop path, with a 25-second timeout:

```sh
timeout 25s /mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe -NoProfile -NonInteractive -Command '$ErrorActionPreference = "Stop"; $path = "Registry::HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\GraphicsDrivers"; $utc = [DateTime]::UtcNow.ToString("o"); $tz = [System.TimeZoneInfo]::FindSystemTimeZoneById("Tokyo Standard Time"); $jst = [System.TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, $tz).ToString("o"); try { $key = Get-Item -LiteralPath $path -ErrorAction Stop; $names = @($key.GetValueNames()); $rows = @(); foreach ($name in @("TdrDelay", "TdrDdiDelay", "TdrLevel")) { $exists = $names -contains $name; if ($exists) { $rows += [ordered]@{ name = $name; exists = $true; value = $key.GetValue($name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames); kind = $key.GetValueKind($name).ToString() } } else { $rows += [ordered]@{ name = $name; exists = $false; value = $null; kind = $null } } }; [ordered]@{ key_available = $true; path = $path; utc = $utc; jst = $jst; timezone = $tz.Id; values = $rows } | ConvertTo-Json -Compress -Depth 5 } catch { [ordered]@{ key_available = $false; path = $path; utc = $utc; jst = $jst; timezone = $tz.Id; error_type = $_.Exception.GetType().FullName; error = $_.Exception.Message } | ConvertTo-Json -Compress -Depth 5; exit 1 }'
```

An initial invocation exited `1` with PowerShell parser error
`Missing closing '}' in statement block or type definition.` It did not execute a registry
read. The command above is the sole completed registry read.

## Coverage limits and causal boundary

- This is a point-in-time observation of the current control-set key only, not historical state.
- No source for Windows defaults was queried; the meaning or effective behavior of absent values
  is unknown in this receipt.
- No driver/version exploration, event query, GPU API, CUDA, NVML, sampler, or workload query ran.
- The observation supports no causal claim about the reported stall or its recovery; that relation
  remains unknown.
