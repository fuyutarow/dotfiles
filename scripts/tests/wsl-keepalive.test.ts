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
  test("parses two marked blocks into alias and distro records", () => {
    expect(parseManagedDistros(config)).toEqual([
      { alias: "r99-u24", distro: "Ubuntu-24.04" },
      { alias: "r99-u26", distro: "r99-u26" },
    ]);
  });

  test("fails when a non-primary block does not declare its distro", () => {
    expect(
      parseManagedDistros(
        "# BEGIN dotfiles-wsl:r99-u26\nHost r99-u26\n# END dotfiles-wsl:r99-u26",
      ),
    ).toBeInstanceOf(Error);
  });

  test("generates one registration per distro with startup and logon triggers", () => {
    const distros = parseManagedDistros(config);
    expect(distros).not.toBeInstanceOf(Error);
    if (distros instanceof Error) return;
    const script = keepalivePowerShell(distros);
    expect(script.match(/Register-ScheduledTask\s+-TaskName/gu)).toHaveLength(
      2,
    );
    expect(script.match(/New-ScheduledTaskTrigger -AtStartup/gu)).toHaveLength(
      2,
    );
    expect(script.match(/New-ScheduledTaskTrigger -AtLogOn/gu)).toHaveLength(2);
    expect(script).toContain("-RestartCount 3");
    expect(script).toContain("-RestartInterval (New-TimeSpan -Minutes 1)");
    expect(script).toContain("-ExecutionTimeLimit ([TimeSpan]::Zero)");
    expect(script).toContain("-NoProfile -WindowStyle Hidden -EncodedCommand");
    const hiddenActions = [
      ...script.matchAll(/-EncodedCommand ([A-Za-z0-9+/=]+)/gu),
    ]
      .map(([, encoded]) => encoded)
      .map((encoded) =>
        Buffer.from(encoded ?? "", "base64").toString("utf16le"),
      );
    expect(hiddenActions).toHaveLength(2);
    expect(hiddenActions[0]).toContain(
      'wsl.exe" -ArgumentList \'-d "Ubuntu-24.04" --exec sleep infinity\' -WindowStyle Hidden -Wait',
    );
    expect(hiddenActions[1]).toContain(
      'wsl.exe" -ArgumentList \'-d "r99-u26" --exec sleep infinity\' -WindowStyle Hidden -Wait',
    );
    expect(script).toContain(
      "Get-ScheduledTask -TaskName 'dotfiles-wsl-keepalive-*'",
    );
    expect(script).toContain("wsl.exe -l -v");
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
        { alias: "r99-u24", distro: "Ubuntu-24.04" },
        { alias: "r99-u26", distro: "r99-u26" },
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
});
