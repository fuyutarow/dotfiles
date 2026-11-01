import { describe, expect, test } from "bun:test";

import {
  PRESSURE_LOG,
  PRESSURE_SCRIPT,
  PRESSURE_TASK_NAME,
  pressureInstallPowerShell,
  pressureRecorderScript,
} from "../wsl-host-pressure";
import { keepalivePowerShell, parseManagedDistros } from "../wsl-keepalive";

const managedR99 = `# BEGIN dotfiles-wsl:r99-u26
Host r99-u26
# WSL-Distro: r99-u26
# END dotfiles-wsl:r99-u26`;

describe("Windows host WSL pressure recorder", () => {
  test("records requested host counters, WSL state, and ISO timestamp", () => {
    const script = pressureRecorderScript();
    for (const field of [
      "timestamp = [DateTimeOffset]::Now.ToString('o')",
      "FreePhysicalMemory",
      "CommittedBytes",
      "CommitLimit",
      "Win32_PageFileUsage",
      "Win32_LogicalDisk",
      "PrivateMemorySize64",
      "WorkingSet64",
      "LoadPercentage",
      "wsl.exe",
      "--list --verbose",
    ]) {
      expect(script).toContain(field);
    }
    expect(script).toContain("WaitForExit(2000)");
    expect(script).toContain(
      "StandardOutputEncoding = [System.Text.Encoding]::Unicode",
    );
    expect(script).toContain("wslStates = $WslState");
    expect(script).toContain("-ge 5MB");
    expect(script).toContain(
      "Move-Item -LiteralPath $Log -Destination $Previous",
    );
    expect(script).toContain("Add-Content -LiteralPath $Log -Encoding UTF8");
    expect(script).not.toContain("--exec");
    expect(script).not.toContain("-d Ubuntu-24.04");
  });

  test("installs a limited 60-second task and verifies it without guest calls", () => {
    const install = pressureInstallPowerShell();
    expect(install).toContain(`-TaskName '${PRESSURE_TASK_NAME}'`);
    expect(install).toContain("-RepetitionInterval (New-TimeSpan -Minutes 1)");
    expect(install).toContain("-ExecutionTimeLimit (New-TimeSpan -Seconds 8)");
    expect(install).toContain("-MultipleInstances IgnoreNew");
    expect(install).toContain("-LogonType S4U -RunLevel Limited");
    expect(install).toContain("sample.ps1");
    expect(install).not.toContain("--exec");

    const check = pressureInstallPowerShell(true);
    expect(check).toContain("pressure recorder verified");
    expect(check).not.toContain("Register-ScheduledTask");
    expect(check).not.toContain("wsl.exe");
  });

  test("keepalive installer includes recorder installation and check", () => {
    const distros = parseManagedDistros(managedR99);
    expect(distros).not.toBeInstanceOf(Error);
    if (distros instanceof Error) return;
    expect(keepalivePowerShell(distros)).toContain(
      `-TaskName '${PRESSURE_TASK_NAME}'`,
    );
    expect(keepalivePowerShell(distros, true)).toContain(
      "pressure recorder verified",
    );
  });

  test("installer exposes a recorder-only path without any WSL invocation", async () => {
    const source = await Bun.file("scripts/wsl-keepalive.ts").text();
    expect(source).toContain("pressureOnly");
    expect(source).toContain("pressureInstallPowerShell(parsed.flags.check)");
  });

  test("keeps stable machine-local log and script names", () => {
    expect(PRESSURE_LOG).toContain(
      "dotfiles-wsl-host-pressure\\pressure.jsonl",
    );
    expect(PRESSURE_SCRIPT).toContain("dotfiles-wsl-host-pressure\\sample.ps1");
  });
});
