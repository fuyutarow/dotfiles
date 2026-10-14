import { describe, expect, test } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  generatePlan,
  normalizeManagedWslConfig,
  repairConfigLocal,
  unifiedConfigDiff,
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
  test("repairs a stale WSL block by adding its code alias and smart-open tag", () => {
    const fixture = [
      "# BEGIN dotfiles-wsl:r99-u26",
      "# WSL-Distro: r99-u26",
      "# WSL-Wake: off",
      "Host r99-u26",
      "    HostName localhost",
      "    Port 2226",
      "    User fuyu",
      "    ProxyJump r99",
      "# END dotfiles-wsl:r99-u26",
    ].join("\n");
    const expected = [
      "# BEGIN dotfiles-wsl:r99-u26",
      "# WSL-Distro: r99-u26",
      "# WSL-Wake: off",
      "Host r99-u26 r99-u26-code",
      "    Tag smart-open",
      "    HostName localhost",
      "    Port 2226",
      "    User fuyu",
      "    ProxyJump r99",
      "# END dotfiles-wsl:r99-u26",
    ].join("\n");

    expect(normalizeManagedWslConfig(fixture).contents).toBe(expected);
    expect(normalizeManagedWslConfig(expected).contents).toBe(expected);
    expect(normalizeManagedWslConfig(fixture).blocks).toEqual([
      {
        id: "r99-u26",
        missing: ["r99-u26-code alias", "Tag smart-open"],
      },
    ]);
  });

  test("repairs only managed blocks and is idempotent", () => {
    const fixture = [
      "Host unmanaged",
      "    HostName unmanaged.invalid",
      "",
      "# BEGIN dotfiles-wsl:r99-u26",
      "# WSL-Distro: Ubuntu-26.04",
      "Host r99-u26 r99-u26-code",
      "    HostName 100.110.117.86",
      "    Port 2226",
      "    User fuyu",
      "# END dotfiles-wsl:r99-u26",
      "",
      "# BEGIN dotfiles-wsl:r99-u24",
      "# WSL-Distro: Ubuntu-24.04",
      "Host r99-u24 r99-u24-code",
      "    Tag smart-open",
      "    HostName 100.110.117.86",
      "    Port 2222",
      "    User fuyu",
      "# END dotfiles-wsl:r99-u24",
    ].join("\n");
    const repaired = normalizeManagedWslConfig(fixture).contents;
    expect(repaired).toContain(
      "# BEGIN dotfiles-wsl:r99-u26\n# WSL-Distro: Ubuntu-26.04\nHost r99-u26 r99-u26-code\n    Tag smart-open\n    HostName 100.110.117.86\n    Port 2226\n    User fuyu\n# END dotfiles-wsl:r99-u26",
    );
    expect(repaired).toContain(
      "Host unmanaged\n    HostName unmanaged.invalid",
    );
    expect(repaired).toContain(
      "# BEGIN dotfiles-wsl:r99-u24\n# WSL-Distro: Ubuntu-24.04\nHost r99-u24 r99-u24-code\n    Tag smart-open",
    );
    expect(normalizeManagedWslConfig(repaired).contents).toBe(repaired);
  });

  test("changes only the Host line when a managed block already has smart-open", () => {
    const fixture = [
      "Host private-box",
      "    HostName private.invalid",
      "# BEGIN dotfiles-wsl:r99-u26",
      "# WSL-Distro: Ubuntu-26.04",
      "Host r99-u26",
      "    Tag smart-open",
      "    HostName localhost",
      "    Port 2226",
      "    User fuyu",
      "    ProxyJump r99",
      "# END dotfiles-wsl:r99-u26",
      "",
    ].join("\r\n");
    const expected = fixture.replace(
      "Host r99-u26\r\n",
      "Host r99-u26 r99-u26-code\r\n",
    );

    expect(normalizeManagedWslConfig(fixture).contents).toBe(expected);
    expect(normalizeManagedWslConfig(expected).contents).toBe(expected);
  });

  test("check mode returns a unified diff and leaves a fixture untouched", async () => {
    const root = mkdtempSync(join(tmpdir(), "wsl-repair-check-"));
    const path = join(root, "config.local");
    const fixture =
      "# BEGIN dotfiles-wsl:box\nHost box\n# END dotfiles-wsl:box\n";
    writeFileSync(path, fixture, { mode: 0o600 });

    const result = await repairConfigLocal(path, true);

    expect(result).not.toBeInstanceOf(Error);
    if (result instanceof Error) return;
    expect(result.changed).toBe(true);
    expect(result.diff).toContain("--- a/~/.ssh/config.local");
    expect(result.diff).toContain("+Host box box-code");
    expect(result.diff).toContain("+    Tag smart-open");
    expect(readFileSync(path, "utf8")).toBe(fixture);
    expect(readdirSync(root)).toEqual(["config.local"]);

    writeFileSync(
      path,
      fixture.replace("Host box\n", "Host box box-code\n    Tag smart-open\n"),
    );
    const clean = await repairConfigLocal(path, true);
    expect(clean).not.toBeInstanceOf(Error);
    if (clean instanceof Error) return;
    expect(clean).toEqual({ changed: false, diff: "" });
    expect(readdirSync(root)).toEqual(["config.local"]);
    rmSync(root, { recursive: true, force: true });
  });

  test("repair-config --check exits 1 for pending changes and 0 when clean", async () => {
    const root = mkdtempSync(join(tmpdir(), "wsl-repair-cli-check-"));
    const sshDir = join(root, ".ssh");
    const path = join(sshDir, "config.local");
    mkdirSync(sshDir, { mode: 0o700 });
    const fixture =
      "# BEGIN dotfiles-wsl:box\nHost box\n    Tag smart-open\n# END dotfiles-wsl:box\n";
    writeFileSync(path, fixture, { mode: 0o600 });
    const script = join(import.meta.dir, "..", "wsl-distro.ts");
    const runCheck = () =>
      Bun.spawn(["bun", script, "repair-config", "--check"], {
        env: { ...process.env, HOME: root },
        stdout: "pipe",
        stderr: "pipe",
      });

    const pending = runCheck();
    const [pendingOut, pendingErr, pendingExit] = await Promise.all([
      new Response(pending.stdout).text(),
      new Response(pending.stderr).text(),
      pending.exited,
    ]);
    expect(pendingExit).toBe(1);
    expect(pendingErr).toBe("");
    expect(pendingOut).toContain("+Host box box-code");
    expect(readFileSync(path, "utf8")).toBe(fixture);
    expect(readdirSync(sshDir)).toEqual(["config.local"]);

    writeFileSync(path, fixture.replace("Host box\n", "Host box box-code\n"));
    const clean = runCheck();
    const [cleanOut, cleanErr, cleanExit] = await Promise.all([
      new Response(clean.stdout).text(),
      new Response(clean.stderr).text(),
      clean.exited,
    ]);
    expect(cleanExit).toBe(0);
    expect(cleanErr).toBe("");
    expect(cleanOut).toBe("");
    expect(readdirSync(sshDir)).toEqual(["config.local"]);
    rmSync(root, { recursive: true, force: true });
  });

  test("apply backs up before atomic replacement, preserves mode, and skips clean files", async () => {
    const root = mkdtempSync(join(tmpdir(), "wsl-repair-apply-"));
    const path = join(root, "config.local");
    const fixture =
      "# BEGIN dotfiles-wsl:box\nHost box\n    Tag smart-open\n# END dotfiles-wsl:box\n";
    writeFileSync(path, fixture, { mode: 0o600 });
    const inodeBefore = statSync(path).ino;

    const result = await repairConfigLocal(path);

    expect(result).not.toBeInstanceOf(Error);
    if (result instanceof Error) return;
    expect(result.changed).toBe(true);
    expect(readFileSync(path, "utf8")).toBe(
      fixture.replace("Host box\n", "Host box box-code\n"),
    );
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(statSync(path).ino).not.toBe(inodeBefore);
    const backup = readdirSync(root).find((name) =>
      /^config\.local\.bak-\d{8}T\d{9}Z$/u.test(name),
    );
    expect(backup).toBeDefined();
    expect(readFileSync(join(root, backup ?? ""), "utf8")).toBe(fixture);
    expect(
      readdirSync(root).filter((name) => name.includes(".tmp-")).length,
    ).toBe(0);

    const inodeClean = statSync(path).ino;
    const entriesClean = readdirSync(root).toSorted();
    const clean = await repairConfigLocal(path);
    expect(clean).toEqual({ changed: false, diff: "" });
    expect(statSync(path).ino).toBe(inodeClean);
    expect(readdirSync(root).toSorted()).toEqual(entriesClean);
    rmSync(root, { recursive: true, force: true });
  });

  test("unified diff is empty for identical config and includes line context", () => {
    expect(unifiedConfigDiff("same\n", "same\n")).toBe("");
    expect(
      unifiedConfigDiff(
        "before\nHost box\nafter\n",
        "before\nHost box box-code\nafter\n",
      ),
    ).toContain(
      "@@ -1,3 +1,3 @@\n before\n-Host box\n+Host box box-code\n after",
    );
  });

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

    const first = await updateConfigLocal(
      path,
      "r99-test",
      "Ubuntu-Test",
      2233,
    );
    expect(first).toBeUndefined();
    const once = readFileSync(path, "utf8");
    expect(once).toContain(
      "# BEGIN dotfiles-wsl:r99-u24\n# WSL-Distro: Ubuntu-24.04\nHost r99-u24 r99-u24-code",
    );
    expect(once).toContain(
      "# BEGIN dotfiles-wsl:r99-test\n# WSL-Distro: Ubuntu-Test\nHost r99-test r99-test-code",
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

    const second = await updateConfigLocal(
      path,
      "r99-test",
      "Ubuntu-Test",
      2233,
    );
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
