// PowerShell 5.1: no junction traversal and no generic deletion of virtual disks.
export const hostFunctions = String.raw`
$ErrorActionPreference='Stop'
function Free-C {
  $c=Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
  if ($null -eq $c.FreeSpace) { throw 'C: free measurement unavailable' }
  [int64]$c.FreeSpace
}
function Files($root) {
  if (!(Test-Path -LiteralPath $root)) { return }
  Get-ChildItem -LiteralPath $root -Force -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) { return }
    if ($_.PSIsContainer) { Files $_.FullName }
    elseif ($_.Extension -notin @('.vhdx','.vhd')) { $_ }
  }
}
$roots=@{
  'winget-cache'=@("$env:LOCALAPPDATA\Microsoft\WinGet")
  'user-temp'=@($env:TEMP)
  'windows-temp'=@("$env:WINDIR\Temp")
  'delivery-optimization'=@("$env:WINDIR\ServiceProfiles\NetworkService\AppData\Local\Microsoft\Windows\DeliveryOptimization\Cache", "$env:ProgramData\Microsoft\Windows\DeliveryOptimization\Cache")
  'wer-dumps'=@("$env:ProgramData\Microsoft\Windows\WER", "$env:LOCALAPPDATA\Microsoft\Windows\WER", "$env:LOCALAPPDATA\CrashDumps", "$env:WINDIR\Minidump", "$env:WINDIR\MEMORY.DMP")
  'windows-update'=@("$env:WINDIR\WinSxS")
  'recycle-bin'=@('C:\$Recycle.Bin')
  'hibernate-off'=@('C:\hiberfil.sys')
}
function Selected($id) {
  foreach($root in $roots[$id]) {
    if (Test-Path -LiteralPath $root -PathType Leaf) { Get-Item -LiteralPath $root -Force }
    else { Files $root }
  }
}
function Eligible($id) {
  Selected $id | Where-Object {
    ($id -notin @('user-temp','windows-temp')) -or ($_.LastWriteTime -lt (Get-Date).AddDays(-1))
  }
}
`;

// GetCompressedFileSize reports allocation, unlike sparse VHDX Get-Item.Length.
// https://learn.microsoft.com/en-us/windows/win32/fileio/sparse-files
export const hostProbe =
  hostFunctions +
  String.raw`
"c_free=$(Free-C)"
"c_total=$((Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'").Size)"
Get-ChildItem -LiteralPath $env:TEMP -Directory -ErrorAction SilentlyContinue |
  Where-Object { !($_.Attributes -band [IO.FileAttributes]::ReparsePoint) } |
  ForEach-Object { Get-Item -LiteralPath (Join-Path $_.FullName 'swap.vhdx') -ErrorAction SilentlyContinue } |
  ForEach-Object { "swap=$([int64]($_.LastWriteTime.ToUniversalTime()-(Get-Date '1970-01-01Z')).TotalMilliseconds)|$($_.Length)|$($_.FullName)" }
foreach($id in $roots.Keys) {
  $bytes='?'
  if ($id -ne 'windows-update') { $bytes=[int64]((Eligible $id | Measure-Object Length -Sum).Sum+0) }
  "lever=$id|$bytes|$($roots[$id] -join '; ')"
}
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class ReclaimAllocation {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern uint GetCompressedFileSizeW(string path, out uint high);
}
'@
$states=@{}
if (Get-Command wsl.exe -ErrorAction SilentlyContinue) {
  $env:WSL_UTF8=1
  wsl.exe -l -v | ForEach-Object {
    $line=$_ -replace "\x00",''
    if ($line -match '^\s*\*?\s*(.+?)\s+(Running|Stopped)\s+\d+\s*$') { $states[$matches[1]]=$matches[2] }
  }
}
Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Lxss' -ErrorAction SilentlyContinue | ForEach-Object {
  $p=Get-ItemProperty $_.PSPath
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
    "windows-update":
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
