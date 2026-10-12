import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { release, tmpdir, userInfo } from "node:os";
import { join } from "node:path";

const username = userInfo().username;
const source = join(import.meta.dir, "dotfiles-root-levers.sudoers");
const template = readFileSync(source, "utf8");
const main = async (): Promise<number> => {
  if (!/microsoft/iu.test(release())) {
    process.stderr.write("FAIL wsl-root-levers: WSL only\n");
    return 2;
  }
  if (username === "root" || !/^[-a-zA-Z0-9_]+$/u.test(username)) {
    process.stderr.write(
      "FAIL wsl-root-levers: run as the owner account, not root\n",
    );
    return 2;
  }
  if (!/^@USER@ /mu.test(template)) {
    process.stderr.write(
      `FAIL wsl-root-levers: missing @USER@ entry in ${source}\n`,
    );
    return 2;
  }

  const tempDir = mkdtempSync(join(tmpdir(), "dotfiles-root-levers-"));
  const sudoers = join(tempDir, "dotfiles-root-levers.sudoers");
  writeFileSync(sudoers, template.replace(/^@USER@/mu, username), {
    mode: 0o600,
  });
  const commands = [
    ["sudo", "visudo", "-cf", sudoers],
    [
      "sudo",
      "install",
      "-o",
      "root",
      "-g",
      "root",
      "-m",
      "0644",
      join(import.meta.dir, "dotfiles-fstrim.service.wsl"),
      "/etc/systemd/system/dotfiles-fstrim.service",
    ],
    [
      "sudo",
      "install",
      "-o",
      "root",
      "-g",
      "root",
      "-m",
      "0644",
      join(import.meta.dir, "dotfiles-dropcache.service.wsl"),
      "/etc/systemd/system/dotfiles-dropcache.service",
    ],
    [
      "sudo",
      "install",
      "-o",
      "root",
      "-g",
      "root",
      "-m",
      "0440",
      sudoers,
      "/etc/sudoers.d/dotfiles-root-levers",
    ],
    ["sudo", "systemctl", "daemon-reload"],
  ];
  const install = async (): Promise<number> => {
    for (const cmd of commands) {
      const executable = cmd[0] ?? "";
      if (Bun.which(executable) === null) {
        process.stderr.write(`FAIL wsl-root-levers: missing ${executable}\n`);
        return 127;
      }
      const proc = Bun.spawn({
        cmd,
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
        timeout: 120_000,
      });
      const code = await proc.exited;
      if (code !== 0) {
        process.stderr.write(
          `FAIL wsl-root-levers: ${cmd.join(" ")} exited ${code}\n`,
        );
        return code;
      }
    }
    process.stdout.write(
      `PASS wsl-root-levers: installed both units and the scoped sudoers rule for ${username}\n`,
    );
    return 0;
  };
  return install().finally(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });
};

const exitCode = await main().catch((error: unknown) => {
  process.stderr.write(`FATAL wsl-root-levers: ${String(error)}\n`);
  return 2;
});
process.exitCode = exitCode;
