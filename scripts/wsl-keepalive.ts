import { cli } from "cleye";
import { homedir } from "node:os";
import { join } from "node:path";

import { PRIMARY_DISTRO_RECORD } from "./wsl-distro";

export type ManagedDistro = { alias: string; distro: string; wake: boolean };

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write(`FATAL: unknown option '--${flag}'\n`);
    process.exit(2);
  }
}

export function parseManagedDistros(contents: string): ManagedDistro[] | Error {
  const records: ManagedDistro[] = [];
  const lines = contents.replaceAll("\r", "").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const start = /^# BEGIN dotfiles-wsl:([^\s]+)$/u.exec(lines[index] ?? "");
    if (start === null) continue;
    const alias = start[1];
    if (alias === undefined) return new Error("managed WSL block has no alias");
    const end = lines.indexOf(`# END dotfiles-wsl:${alias}`, index + 1);
    if (end === -1)
      return new Error(`unterminated dotfiles-wsl block: ${alias}`);
    const block = lines.slice(index + 1, end).join("\n");
    const host = /^\s*Host\s+(.+)\s*$/imu.exec(block)?.[1]?.split(/\s+/u);
    if (host?.includes(alias) !== true) {
      return new Error(`managed block ${alias} does not declare its SSH alias`);
    }
    const distro =
      /^\s*# WSL-Distro:\s*(\S+)\s*$/imu.exec(block)?.[1] ??
      (alias === PRIMARY_DISTRO_RECORD.alias
        ? PRIMARY_DISTRO_RECORD.distro
        : undefined);
    if (distro === undefined) {
      return new Error(`cannot derive WSL distro for managed alias ${alias}`);
    }
    const wakeDirectives = [
      ...block.matchAll(/^\s*# WSL-Wake:\s*(\S+)\s*$/gimu),
    ];
    if (wakeDirectives.length > 1) {
      return new Error(
        `duplicate WSL-Wake directive for managed alias ${alias}`,
      );
    }
    const wakeValue = wakeDirectives[0]?.[1]?.toLowerCase() ?? "on";
    if (wakeValue !== "on" && wakeValue !== "off") {
      return new Error(
        `invalid WSL-Wake value for managed alias ${alias}: ${wakeValue}`,
      );
    }
    if (records.some((record) => record.alias === alias)) {
      return new Error(`duplicate managed WSL alias: ${alias}`);
    }
    records.push({ alias, distro, wake: wakeValue !== "off" });
    index = end;
  }
  return records.length > 0
    ? records
    : new Error("no # BEGIN dotfiles-wsl:<alias> blocks found");
}

export function keepalivePowerShell(
  distros: ManagedDistro[],
  checkOnly = false,
): string {
  const enabled = distros.filter(({ wake }) => wake);
  const skipped = distros
    .filter(({ wake }) => !wake)
    .map(({ alias }) => `Write-Output '${alias}: skipped (wake off)'`);
  const install = checkOnly
    ? []
    : enabled.map(({ alias, distro }) => {
        const taskName = `dotfiles-wsl-keepalive-${alias}`;
        const escapedDistro = distro.replaceAll("'", "''");
        return `$Action = New-ScheduledTaskAction -Execute "$env:SystemRoot\\System32\\wsl.exe" -Argument '-d ${escapedDistro} --exec sleep infinity'
$Triggers = @((New-ScheduledTaskTrigger -AtStartup), (New-ScheduledTaskTrigger -AtLogOn))
$Settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -Hidden
Register-ScheduledTask -TaskName '${taskName}' -Action $Action -Trigger $Triggers -Settings $Settings -Principal $Principal -Force | Out-Null
$RegisteredTask = Get-ScheduledTask -TaskName '${taskName}'
if ($RegisteredTask.State -ne 'Running') { Start-ScheduledTask -TaskName '${taskName}' }`;
      });
  const checks = enabled.map(({ alias, distro }) => {
    const taskName = `dotfiles-wsl-keepalive-${alias}`;
    const escapedDistro = distro.replaceAll("'", "''");
    const result = checkOnly ? "verified" : "installed";
    return `$Task = Get-ScheduledTask -TaskName '${taskName}' -ErrorAction SilentlyContinue
if ($null -eq $Task) { throw 'Scheduled task missing: ${taskName}' }
if ($Task.Principal.UserId -ne $ExpectedPrincipal) { throw 'Scheduled task principal mismatch: ${taskName}' }
if ($Task.Principal.LogonType.ToString() -ne 'S4U') { throw 'Scheduled task logon type mismatch: ${taskName}' }
if ($Task.Principal.RunLevel.ToString() -ne 'Limited') { throw 'Scheduled task run level mismatch: ${taskName}' }
$ExpectedAction = "$env:SystemRoot\\System32\\wsl.exe"
if ($Task.Actions[0].Execute -ine $ExpectedAction) { throw 'Scheduled task action mismatch: ${taskName}' }
if ($Task.Actions[0].Arguments.Trim() -ne '-d ${escapedDistro} --exec sleep infinity') { throw 'Scheduled task arguments mismatch: ${taskName}' }
$TriggerKinds = @($Task.Triggers | ForEach-Object { $_.CimClass.CimClassName })
if ($TriggerKinds -notcontains 'MSFT_TaskBootTrigger') { throw 'Startup trigger missing: ${taskName}' }
if ($TriggerKinds -notcontains 'MSFT_TaskLogonTrigger') { throw 'Logon trigger missing: ${taskName}' }
for ($i = 0; $i -lt 30; $i++) {
  $Task = Get-ScheduledTask -TaskName '${taskName}'
  if ($Task.State -eq 'Running') { break }
  Start-Sleep -Seconds 1
}
if ($Task.State -ne 'Running') { throw 'Keepalive task is not Running: ${taskName}' }
$DistroLine = $WslState -split '\\r?\\n' | Where-Object { $_ -match ('^\\s*\\*?\\s*' + [regex]::Escape('${escapedDistro}') + '\\s+Running\\s+\\d+\\s*$') } | Select-Object -First 1
if (-not $DistroLine) { throw 'WSL distro is not Running: ${escapedDistro}' }
Write-Output ('${alias}: keepalive ${result} (S4U, task Running); {0}' -f $DistroLine.Trim())`;
  });
  const setup =
    enabled.length === 0
      ? ""
      : `$ExpectedPrincipal = $env:USERNAME
$Principal = New-ScheduledTaskPrincipal -UserId $ExpectedPrincipal -LogonType S4U -RunLevel Limited`;
  const stateRead =
    enabled.length === 0
      ? ""
      : `$WslState = [regex]::Replace((wsl.exe -l -v | Out-String), '\\x00', '')
if ($LASTEXITCODE -ne 0) { throw 'wsl.exe -l -v failed' }`;
  return `$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
${setup}
${install.join("\n\n")}
${stateRead}
${skipped.join("\n")}
${checks.join("\n")}
`;
}

export function encodePowerShell(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

export async function managedDistrosFromConfig(
  path = join(homedir(), ".ssh", "config.local"),
): Promise<ManagedDistro[] | Error> {
  const contents = await Bun.file(path)
    .text()
    .catch(() => "");
  return parseManagedDistros(contents);
}

async function main(): Promise<number | Error> {
  const parsed = cli(
    {
      name: "wsl-keepalive.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      help: {
        description:
          "Install or check startup and logon keepalive tasks for managed WSL distros on the Windows host.",
      },
      flags: {
        host: {
          type: String,
          default: "r99",
          description: "Windows SSH alias",
        },
        dryRun: {
          type: Boolean,
          default: false,
          description: "print the decoded PowerShell script without running it",
        },
        check: {
          type: Boolean,
          default: false,
          description:
            "verify task principal, triggers, and distro state without installing",
        },
        alias: {
          type: String,
          default: "",
          description: "limit installation or check to one managed SSH alias",
        },
      },
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (parsed._.length > 0)
    return new Error(`Unexpected argument '${String(parsed._[0])}'`);
  const distros = await managedDistrosFromConfig();
  if (distros instanceof Error) return distros;
  const hasAlias = parsed.flags.alias !== "";
  const selected = hasAlias
    ? distros.filter(({ alias }) => alias === parsed.flags.alias)
    : distros;
  if (selected.length === 0) {
    return new Error(
      hasAlias
        ? `unknown managed WSL alias: ${parsed.flags.alias}`
        : "no managed WSL distros selected",
    );
  }
  const script = keepalivePowerShell(selected, parsed.flags.check);
  if (parsed.flags.dryRun) {
    process.stdout.write(`${script}\n`);
    return 0;
  }
  if (Bun.which("ssh") === null) return new Error("ssh must be on PATH");
  const encoded = encodePowerShell(script);
  const proc = Bun.spawn(
    [
      "ssh",
      parsed.flags.host,
      "pwsh",
      "-NoProfile",
      "-EncodedCommand",
      encoded,
    ],
    { stdout: "pipe", stderr: "pipe", signal: AbortSignal.timeout(180_000) },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  return code === 0
    ? 0
    : new Error(`ssh keepalive installation failed (${code})`);
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
