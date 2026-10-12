import { existsSync, statSync } from "node:fs";
import { release } from "node:os";
import { join } from "node:path";

const main = (): void => {
  if (!/microsoft/iu.test(release())) {
    process.stdout.write("SKIP wsl-root-levers: WSL only\n");
    return;
  }
  const units = [
    "dotfiles-fstrim.service",
    "dotfiles-dropcache.service",
  ] as const;
  const installed = units.map((unit) => {
    const path = join("/etc/systemd/system", unit);
    return existsSync(path) && (statSync(path).mode & 0o777) === 0o644;
  });
  const sudoersPath = "/etc/sudoers.d/dotfiles-root-levers";
  const sudoersInstalled =
    existsSync(sudoersPath) && (statSync(sudoersPath).mode & 0o777) === 0o440;
  const authorized = units.map((unit) => {
    const result = Bun.spawnSync(
      ["sudo", "-n", "-l", "/usr/bin/systemctl", "start", unit],
      { stdout: "pipe", stderr: "pipe", timeout: 10_000 },
    );
    return result.exitCode === 0;
  });
  const checks = [
    ...units.map(
      (unit, index) =>
        `${unit}=${(installed.at(index) ?? false) ? "installed" : "missing"}`,
    ),
    `sudoers=${sudoersInstalled ? "installed" : "missing"}`,
    ...units.map(
      (unit, index) =>
        `${unit} authorization=${(authorized.at(index) ?? false) ? "allowed" : "denied"}`,
    ),
  ];
  const ok =
    installed.every(Boolean) && sudoersInstalled && authorized.every(Boolean);
  process.stdout.write(
    `${ok ? "PASS" : "FAIL"} wsl-root-levers: ${checks.join("; ")}\n`,
  );
  if (!ok) {
    process.stdout.write("fix: mise run wsl:install-root-levers\n");
    process.exitCode = 1;
  }
};

main();
