import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  generatePlan,
  migratePrimaryConfig,
  updateConfigLocal,
  validateOptions,
  type Options,
} from "../wsl-distro";

const options: Options = {
  name: "Ubuntu-Test",
  image: "Ubuntu-24.04",
  port: 2233,
  alias: "r99-test",
  host: "r99-lan",
  dryRun: true,
};

describe("wsl:distro argument contract and dry-run plan", () => {
  test("accepts the declared flags and rejects invalid host, alias, port, and positionals", () => {
    expect(validateOptions({ flags: { ...options }, _: [] })).toEqual(options);
    expect(
      validateOptions({ flags: { ...options, host: "other" }, _: [] }),
    ).toBeInstanceOf(Error);
    expect(
      validateOptions({ flags: { ...options, alias: "*" }, _: [] }),
    ).toBeInstanceOf(Error);
    expect(
      validateOptions({ flags: { ...options, port: 65536 }, _: [] }),
    ).toBeInstanceOf(Error);
    expect(
      validateOptions({ flags: { ...options }, _: ["unexpected"] }),
    ).toBeInstanceOf(Error);
  });

  test("generates the wake, host setup, local config, and final verification steps", () => {
    const plan = generatePlan(options, "cHVibGljLWtleQ==");
    expect(plan.map(({ label }) => label)).toEqual([
      "mark and rename the r99-u24 block in ~/.ssh/config.local",
      "wake r99-u24 so its Tailscale address is active",
      "check image/help and install/configure distro over Windows SSH",
      "write marked ~/.ssh/config.local block for r99-test",
      "verify ssh r99-test and print OS identity",
    ]);
    const remote = plan[2]?.argv.join(" ") ?? "";
    expect(remote).toContain("ssh r99-lan");
    expect(remote).toContain("EncodedCommand");
    const script = Buffer.from(
      remote.split("EncodedCommand ")[1] ?? "",
      "base64",
    ).toString("utf16le");
    expect(script).toContain("wsl.exe --list --online");
    expect(script).toContain(
      "wsl.exe --install --distribution $Image --name $Distro --no-launch",
    );
    expect(script).toContain("Port 2233");
    expect(script).toContain("systemctl enable --now ssh");
    expect(plan[4]?.argv).toEqual([
      "ssh",
      "r99-test",
      "uname -a; cat /etc/os-release | head -2",
    ]);
  });
});

describe("~/.ssh/config.local writer", () => {
  test("marks the renamed primary and requested alias idempotently without changing other blocks", async () => {
    const previous = ["r99", "wsl"].join("-");
    const previousCode = `${previous}-code`;
    const root = mkdtempSync(join(tmpdir(), "wsl-distro-config-"));
    const path = join(root, "config.local");
    const unrelated = `Host sol sol-code\n    HostName sol.invalid\n    User researcher\n`;
    writeFileSync(
      path,
      `${unrelated}\nHost ${previous} ${previousCode}\n    Tag smart-open\n    HostName 100.110.117.86\n    Port 2222\n    User fuyu\n\n# Windows host block note\nHost r99\n    HostName host.invalid\n    User fuyutarow\n`,
    );

    const first = await updateConfigLocal(path, "r99-test", 2233);
    expect(first).toBeUndefined();
    const once = readFileSync(path, "utf8");
    expect(once).toContain(
      "# BEGIN dotfiles-wsl:r99-u24\nHost r99-u24 r99-u24-code",
    );
    expect(once).toContain(
      "# BEGIN dotfiles-wsl:r99-test\nHost r99-test r99-test-code",
    );
    expect(once).toContain(
      "HostName 100.110.117.86\n    Port 2233\n    User fuyu",
    );
    expect(once).toContain(unrelated.trimEnd());
    expect(once).toContain("# Windows host block note\nHost r99");
    expect(once).toContain(
      "Host r99\n    HostName host.invalid\n    User fuyutarow",
    );
    expect(once).not.toContain(`${previous} ${previousCode}`);

    const second = await updateConfigLocal(path, "r99-test", 2233);
    expect(second).toBeUndefined();
    expect(readFileSync(path, "utf8")).toBe(once);
    rmSync(root, { recursive: true, force: true });
  });

  test("primary rename is a local edit and leaves unrelated host records intact", () => {
    const previous = ["r99", "wsl"].join("-");
    const text = `Host sol\n    HostName sol.invalid\n\nHost ${previous} ${previous}-code\n    HostName 100.110.117.86\n    Port 2222\n    User fuyu\n\nHost r99\n    HostName host.invalid\n`;
    const result = migratePrimaryConfig(text);
    expect(result).not.toBeInstanceOf(Error);
    if (result instanceof Error) return;
    expect(result.hostName).toBe("100.110.117.86");
    expect(result.contents).toContain("Host r99-u24 r99-u24-code");
    expect(result.contents).toContain("Host sol\n    HostName sol.invalid");
    expect(result.contents).toContain("Host r99\n    HostName host.invalid");
  });
});
