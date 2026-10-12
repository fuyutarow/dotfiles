// PowerShell 5.1: no junction traversal and no generic deletion of virtual disks.
export const hostFunctions = String.raw`
$ErrorActionPreference='Stop'
function Probe-Step($step) { [Console]::Error.WriteLine("disk-reclaim-step=$step") }
function Free-C {
  $c=Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
  if ($null -eq $c.FreeSpace) { throw 'C: free measurement unavailable' }
  [int64]$c.FreeSpace
}
function Files($root, $includeVirtualDisks=$false) {
  if (!(Test-Path -LiteralPath $root)) { return }
  Get-ChildItem -LiteralPath $root -Force -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) { return }
    if ($_.PSIsContainer) { Files $_.FullName $includeVirtualDisks }
    elseif ($includeVirtualDisks -or $_.Extension -notin @('.vhdx','.vhd')) { $_ }
  }
}
$roots=@{
  # WinGet's transient cache lives under TEMP. The LOCALAPPDATA\Microsoft\WinGet
  # tree also contains persistent portable installs in Packages and Links.
  'winget-cache'=@("$env:TEMP\WinGet")
  'user-temp'=@($env:TEMP)
  'windows-temp'=@("$env:WINDIR\Temp")
  'windows-update-download'=@("$env:WINDIR\SoftwareDistribution\Download")
  'windows-update-components'=@("$env:WINDIR\WinSxS")
  'delivery-optimization'=@("$env:WINDIR\ServiceProfiles\NetworkService\AppData\Local\Microsoft\Windows\DeliveryOptimization\Cache", "$env:ProgramData\Microsoft\Windows\DeliveryOptimization\Cache")
  'wer-dumps'=@("$env:ProgramData\Microsoft\Windows\WER", "$env:LOCALAPPDATA\Microsoft\Windows\WER", "$env:LOCALAPPDATA\CrashDumps", "$env:WINDIR\Minidump", "$env:WINDIR\MEMORY.DMP")
  'browser-crash-dumps'=@(
    "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Crashpad\reports", "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Crashpad\temp",
    "$env:LOCALAPPDATA\Microsoft\Edge Beta\User Data\Crashpad\reports", "$env:LOCALAPPDATA\Microsoft\Edge Beta\User Data\Crashpad\temp",
    "$env:LOCALAPPDATA\Microsoft\Edge Dev\User Data\Crashpad\reports", "$env:LOCALAPPDATA\Microsoft\Edge Dev\User Data\Crashpad\temp",
    "$env:LOCALAPPDATA\Microsoft\Edge SxS\User Data\Crashpad\reports", "$env:LOCALAPPDATA\Microsoft\Edge SxS\User Data\Crashpad\temp",
    "$env:LOCALAPPDATA\Google\Chrome\User Data\Crashpad\reports", "$env:LOCALAPPDATA\Google\Chrome\User Data\Crashpad\temp",
    "$env:LOCALAPPDATA\Google\Chrome SxS\User Data\Crashpad\reports", "$env:LOCALAPPDATA\Google\Chrome SxS\User Data\Crashpad\temp",
    "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\User Data\Crashpad\reports", "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\User Data\Crashpad\temp"
  )
  'npm-cache'=@("$env:LOCALAPPDATA\npm-cache", "$env:APPDATA\npm-cache")
  'pip-cache'=@("$env:LOCALAPPDATA\pip\Cache", "$env:USERPROFILE\.cache\pip")
  'uv-cache'=@("$env:LOCALAPPDATA\uv\cache", "$env:USERPROFILE\.cache\uv")
  'nuget-cache'=@("$env:LOCALAPPDATA\NuGet\v3-cache", "$env:USERPROFILE\.nuget\packages")
  'cargo-cache'=@("$env:USERPROFILE\.cargo\registry", "$env:USERPROFILE\.cargo\git")
  'nvidia-download-cache'=@('C:\NVIDIA', "$env:LOCALAPPDATA\NVIDIA\Downloader", "$env:LOCALAPPDATA\NVIDIA Corporation\NVIDIA app\UpdateFramework")
  'winget-download-cache'=@("$env:LOCALAPPDATA\Packages\Microsoft.DesktopAppInstaller_8wekyb3d8bbwe\LocalCache")
  'recycle-bin'=@('C:\$Recycle.Bin')
  'hibernate-off'=@('C:\hiberfil.sys')
  'claude-vm-bundles'=@("$env:APPDATA\Claude\vm_bundles")
}
function Selected($id) {
  foreach($root in $roots[$id]) {
    if (Test-Path -LiteralPath $root -PathType Leaf) { Get-Item -LiteralPath $root -Force }
    else { Files $root }
  }
}
function Eligible($id) {
  $wingetTemp=Join-Path $env:TEMP 'WinGet'
  Selected $id | Where-Object {
    (($id -notin @('user-temp','windows-temp')) -or ($_.LastWriteTime -lt (Get-Date).AddDays(-1))) -and
    (($id -ne 'user-temp') -or !$_.FullName.StartsWith($wingetTemp, [StringComparison]::OrdinalIgnoreCase))
  }
}
`;

// GetCompressedFileSize reports allocation, unlike sparse VHDX Get-Item.Length.
// https://learn.microsoft.com/en-us/windows/win32/fileio/sparse-files
export const hostProbe =
  hostFunctions +
  String.raw`
Probe-Step 'PowerShell allocation helper'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class ReclaimAllocation {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern uint GetCompressedFileSizeW(string path, out uint high);
}
'@
function SizeOnDisk($path) {
  [uint32]$high=0
  $low=[ReclaimAllocation]::GetCompressedFileSizeW($path,[ref]$high)
  if ($low -eq [uint32]::MaxValue -and [Runtime.InteropServices.Marshal]::GetLastWin32Error() -ne 0) { throw "allocation size unavailable: $path" }
  ([uint64]$high*4294967296)+$low
}
Probe-Step 'C: free-space measurement'
"c_free=$(Free-C)"
"c_total=$((Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'").Size)"
Probe-Step 'TEMP swap scan'
Get-ChildItem -LiteralPath $env:TEMP -Directory -ErrorAction SilentlyContinue |
  Where-Object { !($_.Attributes -band [IO.FileAttributes]::ReparsePoint) } |
  ForEach-Object { Get-Item -LiteralPath (Join-Path $_.FullName 'swap.vhdx') -ErrorAction SilentlyContinue } |
  ForEach-Object { "swap=$([int64]($_.LastWriteTime.ToUniversalTime()-(Get-Date '1970-01-01Z')).TotalMilliseconds)|$(SizeOnDisk $_.FullName)|$($_.FullName)" }
foreach($id in $roots.Keys) {
  Probe-Step "lever $id allocation scan"
  $bytes='?'
  if ($id -eq 'claude-vm-bundles') {
    [uint64]$total=0
    foreach($root in $roots[$id]) { foreach($item in (Files $root $true)) { $total += SizeOnDisk $item.FullName } }
    $bytes=$total
  } else {
    [uint64]$total=0
    foreach($item in (Eligible $id)) { $total += SizeOnDisk $item.FullName }
    $bytes=$total
  }
  "lever=$id|$bytes|$($roots[$id] -join '; ')"
}
Probe-Step 'pagefile measurement'
$pageFiles=Get-CimInstance Win32_PageFileUsage -ErrorAction Stop
[uint64]$pageFileBytes=0
foreach($pageFile in $pageFiles) { $pageFileBytes += [uint64]$pageFile.AllocatedBaseSize * 1MB }
"lever=pagefile-size|$pageFileBytes|$($pageFiles.Name -join '; ')"
$states=@{}
if (Get-Command wsl.exe -ErrorAction SilentlyContinue) {
  Probe-Step 'wsl.exe -l -v'
  $env:WSL_UTF8=1
  wsl.exe -l -v | ForEach-Object {
    $line=$_ -replace "\x00",''
    if ($line -match '^\s*\*?\s*(.+?)\s+(Running|Stopped)\s+\d+\s*$') { $states[$matches[1]]=$matches[2] }
  }
}
Probe-Step 'WSL registry and VHDX allocation scan'
Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Lxss' -ErrorAction SilentlyContinue | ForEach-Object {
  $p=Get-ItemProperty $_.PSPath
  if ([string]::IsNullOrWhiteSpace($p.BasePath)) { return }
  Get-ChildItem -LiteralPath $p.BasePath -Filter '*.vhdx' -File -ErrorAction SilentlyContinue | ForEach-Object {
    [uint32]$high=0; $low=[ReclaimAllocation]::GetCompressedFileSizeW($_.FullName,[ref]$high)
    $allocated='?'
    if ($low -ne [uint32]::MaxValue -or [Runtime.InteropServices.Marshal]::GetLastWin32Error() -eq 0) { $allocated=([uint64]$high*4294967296)+$low }
    $state=$states[$p.DistributionName]; if (!$state) { $state='unknown' }
    "vhdx=$allocated|$($p.DistributionName)|$state|$($_.FullName)"
  }
}
`;

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
export function hostAction(id: string, path: string): string {
  const actions: Record<string, string> = {
    "delivery-optimization": "Delete-DeliveryOptimizationCache -Force",
    "windows-update-components":
      'dism.exe /Online /Cleanup-Image /StartComponentCleanup; if ($LASTEXITCODE -ne 0) { throw "DISM exit $LASTEXITCODE" }',
    "recycle-bin": "Clear-RecycleBin -DriveLetter C -Force",
    "hibernate-off":
      'powercfg.exe /h off; if ($LASTEXITCODE -ne 0) { throw "powercfg exit $LASTEXITCODE" }',
    "orphan-swap": `$swap=Get-Item -LiteralPath ${quote(path)}; if ($swap.Name -ne 'swap.vhdx' -or ($swap.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'refusing virtual disk deletion outside orphan swap' }; Remove-Item -LiteralPath $swap.FullName -Force -ErrorAction SilentlyContinue`,
  };
  const action =
    actions[id] ??
    `Eligible ${quote(id)} | ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue }`;
  return `${hostFunctions}\n$before=Free-C; "c_before=$before"\ntry { ${action} } catch { "failure=$($_.Exception.Message)"; "c_after=$(Free-C)"; exit 1 }\n"c_after=$(Free-C)"`;
}
