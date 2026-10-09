import { cli } from "cleye";
import { homedir } from "node:os";
import { join } from "node:path";

import { PRIMARY_DISTRO_RECORD } from "./wsl-distro";

export type ManagedDistro = { alias: string; distro: string };

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
    if (records.some((record) => record.alias === alias)) {
      return new Error(`duplicate managed WSL alias: ${alias}`);
    }
    records.push({ alias, distro });
    index = end;
  }
  return records.length > 0
    ? records
    : new Error("no # BEGIN dotfiles-wsl:<alias> blocks found");
}

export function keepalivePowerShell(distros: ManagedDistro[]): string {
  const install = distros.map(({ alias, distro }) => {
    const taskName = `dotfiles-wsl-keepalive-${alias}`;
    const escapedDistro = distro.replaceAll("'", "''");
    const hiddenAction = encodePowerShell(
      `Start-Process -FilePath "$env:SystemRoot\\System32\\wsl.exe" -ArgumentList '-d "${escapedDistro}" --exec sleep infinity' -WindowStyle Hidden -Wait`,
    );
    return `$Action = New-ScheduledTaskAction -Execute "$env:SystemRoot\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Argument '-NoProfile -WindowStyle Hidden -EncodedCommand ${hiddenAction}'
$Triggers = @((New-ScheduledTaskTrigger -AtStartup), (New-ScheduledTaskTrigger -AtLogOn))
$Settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -Hidden
Register-ScheduledTask -TaskName '${taskName}' -Action $Action -Trigger $Triggers -Settings $Settings -Force | Out-Null`;
  });
  const checks = distros.map(({ alias, distro }) => {
    const taskName = `dotfiles-wsl-keepalive-${alias}`;
    const escapedDistro = distro.replaceAll("'", "''");
    return `if ($TaskNames -notcontains '${taskName}') { throw 'Scheduled task missing: ${taskName}' }
$DistroState = $WslState -split '\\r?\\n' | Where-Object { $_ -match '${escapedDistro}' } | Select-Object -First 1
if (-not $DistroState) { throw 'WSL distro missing: ${escapedDistro}' }
Write-Output ('${alias}: keepalive installed; {0}' -f $DistroState.Trim())`;
  });
  return `$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
${install.join("\n\n")}
$TaskNames = @(Get-ScheduledTask -TaskName 'dotfiles-wsl-keepalive-*' | ForEach-Object { $_.TaskName })
$WslState = (wsl.exe -l -v | Out-String) -replace "\`0", ''
if ($LASTEXITCODE -ne 0) { throw 'wsl.exe -l -v failed' }
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
          "Install one startup and logon keepalive scheduled task for each managed WSL distro on the Windows host.",
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
      },
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (parsed._.length > 0)
    return new Error(`Unexpected argument '${String(parsed._[0])}'`);
  const distros = await managedDistrosFromConfig();
  if (distros instanceof Error) return distros;
  const script = keepalivePowerShell(distros);
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
