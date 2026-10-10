import { describe, expect, test } from "bun:test";

import {
  encodePowerShell,
  keepalivePowerShell,
  parseManagedDistros,
} from "../wsl-keepalive";
import { wakeManagedDistros } from "../wsl-wake";

const config = `# BEGIN dotfiles-wsl:r99-u24
Host r99-u24 r99-u24-code
# WSL-Distro: Ubuntu-24.04
# WSL-Wake: off
    HostName 100.64.0.1
    Port 2222
# END dotfiles-wsl:r99-u24

# BEGIN dotfiles-wsl:r99-u26
Host r99-u26 r99-u26-code
# WSL-Distro: r99-u26
    HostName 100.64.0.1
    Port 2226
# END dotfiles-wsl:r99-u26
`;

describe("managed WSL keepalive", () => {
  test("parses marked blocks and wake opt-out into alias and distro records", () => {
    expect(parseManagedDistros(config)).toEqual([
      { alias: "r99-u24", distro: "Ubuntu-24.04", wake: false },
      { alias: "r99-u26", distro: "r99-u26", wake: true },
    ]);
  });

  test("defaults wake to on and rejects invalid or duplicate directives", () => {
    const base = `# BEGIN dotfiles-wsl:r99-u26\nHost r99-u26\n# WSL-Distro: r99-u26\n`;
    expect(parseManagedDistros(`${base}# END dotfiles-wsl:r99-u26`)).toEqual([
      { alias: "r99-u26", distro: "r99-u26", wake: true },
    ]);
    expect(
      parseManagedDistros(
        `${base}# WSL-Wake: maybe\n# END dotfiles-wsl:r99-u26`,
      ),
    ).toBeInstanceOf(Error);
    expect(
      parseManagedDistros(
        `${base}# WSL-Wake: off\n# WSL-Wake: on\n# END dotfiles-wsl:r99-u26`,
      ),
    ).toBeInstanceOf(Error);
  });

  test("fails when a non-primary block does not declare its distro", () => {
    expect(
      parseManagedDistros(
        "# BEGIN dotfiles-wsl:r99-u26\nHost r99-u26\n# END dotfiles-wsl:r99-u26",
      ),
    ).toBeInstanceOf(Error);
  });

  test("generates direct S4U wsl.exe action with startup and logon triggers", () => {
    const distros = parseManagedDistros(config);
    expect(distros).not.toBeInstanceOf(Error);
    if (distros instanceof Error) return;
    const script = keepalivePowerShell(distros);
    expect(script.match(/Register-ScheduledTask\s+-TaskName/gu)).toHaveLength(
      1,
    );
    expect(script.match(/New-ScheduledTaskTrigger -AtStartup/gu)).toHaveLength(
      1,
    );
    expect(script.match(/New-ScheduledTaskTrigger -AtLogOn/gu)).toHaveLength(1);
    expect(script).toContain(
      "New-ScheduledTaskPrincipal -UserId $ExpectedPrincipal -LogonType S4U -RunLevel Limited",
    );
    expect(script).toContain("-Principal $Principal -Force");
    expect(script).toContain("$Task.Principal.LogonType.ToString() -ne 'S4U'");
    expect(script).toContain("Running\\s+\\d+");
    expect(script).toContain("-RestartCount 3");
    expect(script).toContain("-RestartInterval (New-TimeSpan -Minutes 1)");
    expect(script).toContain("-ExecutionTimeLimit ([TimeSpan]::Zero)");
    expect(script).toContain(
      "New-ScheduledTaskAction -Execute \"$env:SystemRoot\\System32\\wsl.exe\" -Argument '-d r99-u26 --exec sleep infinity'",
    );
    expect(script).not.toContain("Start-Process");
    expect(script).toContain(
      "Start-ScheduledTask -TaskName 'dotfiles-wsl-keepalive-r99-u26'",
    );
    expect(script).toContain("if ($Task.State -ne 'Running')");
    expect(script).toContain("Scheduled task action mismatch");
    expect(script).toContain("Scheduled task arguments mismatch");
    expect(script).toContain("Keepalive task is not Running");
    expect(script).toContain("r99-u24: skipped (wake off)");
    expect(script).toContain(
      "Get-ScheduledTask -TaskName 'dotfiles-wsl-keepalive-r99-u26'",
    );
    expect(script).toContain("wsl.exe -l -v");
    expect(script).not.toContain(".Replace([char]0");
  });

  test("check-only mode verifies without registering tasks", () => {
    const distros = parseManagedDistros(config);
    expect(distros).not.toBeInstanceOf(Error);
    if (distros instanceof Error) return;
    const script = keepalivePowerShell(distros, true);
    expect(script).not.toContain("Register-ScheduledTask");
    expect(script).toContain("keepalive verified (S4U, task Running)");
    expect(script).toContain("r99-u24: skipped (wake off)");
  });

  test("encoded command round-trips as UTF-16LE PowerShell text", () => {
    const script = "Write-Output '雪';\n$ErrorActionPreference = 'Stop'\n";
    expect(
      Buffer.from(encodePowerShell(script), "base64").toString("utf16le"),
    ).toBe(script);
  });
});

describe("wakeManagedDistros", () => {
  test("continues to the next distro after a failure", async () => {
    const visited: string[] = [];
    const results = await wakeManagedDistros(
      [
        { alias: "r99-u24", distro: "Ubuntu-24.04", wake: true },
        { alias: "r99-u26", distro: "r99-u26", wake: true },
      ],
      ({ alias }) => {
        visited.push(alias);
        if (alias === "r99-u24")
          return Promise.resolve(new Error("ssh unavailable"));
        return Promise.resolve(`${alias}: reachable`);
      },
    );
    expect(visited).toEqual(["r99-u24", "r99-u26"]);
    expect(results).toEqual([
      "r99-u24: FAILED — ssh unavailable",
      "r99-u26: reachable",
    ]);
  });

  test("does not invoke the wake callback for an opted-out distro", async () => {
    const visited: string[] = [];
    const results = await wakeManagedDistros(
      [
        { alias: "r99-u24", distro: "Ubuntu-24.04", wake: false },
        { alias: "r99-u26", distro: "r99-u26", wake: true },
      ],
      ({ alias }) => {
        visited.push(alias);
        return Promise.resolve(`${alias}: reachable`);
      },
    );
    expect(visited).toEqual(["r99-u26"]);
    expect(results).toEqual([
      "r99-u24: skipped (wake off)",
      "r99-u26: reachable",
    ]);
  });
});
