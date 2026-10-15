import { stat } from "node:fs/promises";
import { release } from "node:os";
import { join } from "node:path";

const hasMode = async (path: string, mode: number): Promise<boolean> =>
  stat(path).then(
    (info) => (info.mode & 0o777) === mode,
    () => false,
  );

const main = async (): Promise<void> => {
  if (!/microsoft/iu.test(release())) {
    process.stdout.write("SKIP wsl-root-levers: WSL only\n");
    return;
  }
  const units = [
    "dotfiles-fstrim.service",
    "dotfiles-dropcache.service",
  ] as const;
  const installed = await Promise.all(
    units.map((unit) => hasMode(join("/etc/systemd/system", unit), 0o644)),
  );
  const sudoersPath = "/etc/sudoers.d/dotfiles-root-levers";
  const sudoersInstalled = await hasMode(sudoersPath, 0o440);
  const authorized: boolean[] = [];
  for (const unit of units) {
    const proc = Bun.spawn(
      ["sudo", "-n", "-l", "/usr/bin/systemctl", "start", unit],
      { stdout: "ignore", stderr: "ignore", timeout: 10_000 },
    );
    authorized.push((await proc.exited) === 0);
  }
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

await main();
