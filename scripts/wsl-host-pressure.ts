import { cli } from "cleye";

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write(`FATAL: unknown option '--${flag}'\n`);
    process.exit(2);
  }
}

export const PRESSURE_TASK_NAME = "dotfiles-wsl-host-pressure-r99";
export const PRESSURE_ROOT = "$env:LOCALAPPDATA\\dotfiles-wsl-host-pressure";
export const PRESSURE_LOG = `${PRESSURE_ROOT}\\pressure.jsonl`;
export const PRESSURE_SCRIPT = `${PRESSURE_ROOT}\\sample.ps1`;

export function pressureRecorderScript(): string {
  return String.raw`$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$Root = Join-Path $env:LOCALAPPDATA 'dotfiles-wsl-host-pressure'
$Log = Join-Path $Root 'pressure.jsonl'
New-Item -ItemType Directory -Path $Root -Force | Out-Null
$Started = [DateTimeOffset]::Now
$WslState = 'timeout'
$Wsl = $null
try {
  $Wsl = [System.Diagnostics.Process]::new()
  $Wsl.StartInfo.FileName = Join-Path $env:SystemRoot 'System32\wsl.exe'
  $Wsl.StartInfo.Arguments = '--list --verbose'
  $Wsl.StartInfo.UseShellExecute = $false
  $Wsl.StartInfo.CreateNoWindow = $true
  $Wsl.StartInfo.RedirectStandardOutput = $true
  $Wsl.StartInfo.RedirectStandardError = $true
  $Wsl.StartInfo.StandardOutputEncoding = [System.Text.Encoding]::Unicode
  $Wsl.Start() | Out-Null
  $OutTask = $Wsl.StandardOutput.ReadToEndAsync()
  $ErrTask = $Wsl.StandardError.ReadToEndAsync()
  if ($Wsl.WaitForExit(2000)) {
    $Text = $OutTask.GetAwaiter().GetResult()
    $WslState = ($Text -replace '\x00','').Trim() -replace '\r?\n',' / '
    if ($Wsl.ExitCode -ne 0) { $WslState = "exit:$($Wsl.ExitCode) $WslState" }
  } else {
    $Wsl.Kill()
    $WslState = 'timeout'
  }
} catch {
  $WslState = 'error:' + $_.Exception.GetType().Name
} finally {
  if ($null -ne $Wsl) { $Wsl.Dispose() }
}
$Os = Get-CimInstance Win32_OperatingSystem
$Memory = Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory
$Paging = @(Get-CimInstance Win32_PageFileUsage | Measure-Object -Property CurrentUsage -Sum)
$Disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
$Vmmem = @(Get-Process -Name vmmemWSL -ErrorAction SilentlyContinue)
$Cpu = @(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average)
$PagingUsage = $Paging.Sum
if ($null -eq $PagingUsage) { $PagingUsage = 0 }
$VmmemPrivate = ($Vmmem | Measure-Object -Property PrivateMemorySize64 -Sum).Sum
if ($null -eq $VmmemPrivate) { $VmmemPrivate = 0 }
$VmmemWorkingSet = ($Vmmem | Measure-Object -Property WorkingSet64 -Sum).Sum
if ($null -eq $VmmemWorkingSet) { $VmmemWorkingSet = 0 }
$CpuPercent = $Cpu.Average
if ($null -eq $CpuPercent) { $CpuPercent = 0 }
$Record = [ordered]@{
  timestamp = [DateTimeOffset]::Now.ToString('o')
  availableMBytes = [uint64]$Os.FreePhysicalMemory / 1024
  committedBytes = [uint64]$Memory.CommittedBytes
  commitLimit = [uint64]$Memory.CommitLimit
  pagefileCurrentUsageMBytes = [uint64]$PagingUsage
  cFreeBytes = [uint64]$Disk.FreeSpace
  vmmemWSLPrivateBytes = [uint64]$VmmemPrivate
  vmmemWSLWorkingSetBytes = [uint64]$VmmemWorkingSet
  hostCpuPercent = [double]$CpuPercent
  wslStates = $WslState
  sampleDurationMs = [int]([DateTimeOffset]::Now - $Started).TotalMilliseconds
}
if ((Test-Path $Log) -and (Get-Item $Log).Length -ge 5MB) {
  $Previous = "$Log.1"
  if (Test-Path $Previous) { Remove-Item -LiteralPath $Previous -Force }
  Move-Item -LiteralPath $Log -Destination $Previous
}
$Record | ConvertTo-Json -Compress | Add-Content -LiteralPath $Log -Encoding UTF8
`;
}

export function pressureInstallPowerShell(checkOnly = false): string {
  const recorder = pressureRecorderScript();
  const setup = checkOnly
    ? ""
    : `$Root = Join-Path $env:LOCALAPPDATA 'dotfiles-wsl-host-pressure'
New-Item -ItemType Directory -Path $Root -Force | Out-Null
$Recorder = @'
${recorder}
'@
Set-Content -LiteralPath (Join-Path $Root 'sample.ps1') -Value $Recorder -Encoding UTF8
$Action = New-ScheduledTaskAction -Execute "$env:SystemRoot\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + (Join-Path $Root 'sample.ps1') + '"')
$Trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration (New-TimeSpan -Days 3650)
$Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Seconds 8) -Hidden
Register-ScheduledTask -TaskName '${PRESSURE_TASK_NAME}' -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Force | Out-Null`;
  const checks = checkOnly
    ? `$Task = Get-ScheduledTask -TaskName '${PRESSURE_TASK_NAME}' -ErrorAction SilentlyContinue
if ($null -eq $Task) { throw 'Pressure recorder scheduled task missing' }
if ($Task.Principal.UserId -ne $ExpectedPrincipal) { throw 'Pressure recorder principal mismatch' }
if ($Task.Principal.LogonType.ToString() -ne 'S4U') { throw 'Pressure recorder logon type mismatch' }
if ($Task.Actions[0].Execute -ine "$env:SystemRoot\\System32\\WindowsPowerShell\\v1.0\\powershell.exe") { throw 'Pressure recorder action mismatch' }
if ($Task.Actions[0].Arguments -notlike '*sample.ps1*') { throw 'Pressure recorder script argument mismatch' }
if (-not (Test-Path (Join-Path $env:LOCALAPPDATA 'dotfiles-wsl-host-pressure\\sample.ps1'))) { throw 'Pressure recorder script missing' }
Write-Output 'pressure recorder verified'`
    : `$Task = Get-ScheduledTask -TaskName '${PRESSURE_TASK_NAME}' -ErrorAction SilentlyContinue
if ($null -eq $Task) { throw 'Pressure recorder scheduled task missing after install' }
Write-Output 'pressure recorder installed (60-second interval; 5 MB rotation)'`;
  return `$ExpectedPrincipal = $env:USERNAME
$Principal = New-ScheduledTaskPrincipal -UserId $ExpectedPrincipal -LogonType S4U -RunLevel Limited
${setup}
${checks}
`;
}

async function main(): Promise<number | Error> {
  const parsed = cli(
    {
      name: "wsl-host-pressure.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      help: {
        description:
          "Read the tail of the Windows-host WSL pressure recorder log.",
      },
      flags: {
        host: {
          type: String,
          default: "r99",
          description: "Windows SSH alias",
        },
        tail: {
          type: Number,
          default: 120,
          description: "number of JSONL samples",
        },
      },
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (parsed._.length > 0)
    return new Error(`Unexpected argument '${String(parsed._[0])}'`);
  if (
    !Number.isInteger(parsed.flags.tail) ||
    parsed.flags.tail < 1 ||
    parsed.flags.tail > 1000
  )
    return new Error("--tail must be an integer from 1 to 1000");
  if (Bun.which("ssh") === null) return new Error("ssh must be on PATH");
  const script = `Get-Content -LiteralPath (Join-Path $env:LOCALAPPDATA 'dotfiles-wsl-host-pressure\\pressure.jsonl') -Tail ${parsed.flags.tail}`;
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const timeout = AbortSignal.timeout(10_000);
  const proc = Bun.spawn(
    [
      "ssh",
      "-o",
      "ConnectTimeout=5",
      parsed.flags.host,
      "pwsh",
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      encoded,
    ],
    { stdout: "pipe", stderr: "pipe", signal: timeout },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  if (timeout.aborted)
    return new Error("SSH pressure log read timed out after 10 seconds");
  return code === 0 ? 0 : new Error(`ssh pressure log read failed (${code})`);
}

if (import.meta.main) {
  const result = await Promise.try(main).then(
    (value) => value,
    (error: unknown) =>
      new Error(error instanceof Error ? error.message : String(error)),
  );
  if (result instanceof Error) {
    process.stderr.write(`FATAL: ${result.message}\n`);
    process.exitCode = 2;
  } else {
    process.exitCode = result;
  }
}
