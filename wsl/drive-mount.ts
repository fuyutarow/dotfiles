// Install the declared Google Drive drvfs entry into /etc/fstab. Existing entries and unrelated
// fstab rows are preserved; a conflicting /mnt/g entry fails with a repair instruction.
import { chmod, mkdir, rename, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { attempt, errorMessage } from "../agents/hooks/attempt.ts";

const FSTAB = "/etc/fstab";

export function ensureFstabEntry(
  current: string,
  declaredLine: string,
): { content: string; changed: boolean; conflict?: string } {
  const expected = declaredLine.trim().split(/\s+/u);
  const active = current
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
  const sameMount = active.filter(
    (line) => (line.split(/\s+/u)[1] ?? "") === (expected[1] ?? ""),
  );
  if (sameMount.length > 0) {
    const exact =
      sameMount.length === 1 &&
      sameMount.every(
        (line) => line.split(/\s+/u).join(" ") === expected.join(" "),
      );
    return exact
      ? { content: current, changed: false }
      : {
          content: current,
          changed: false,
          conflict: `an existing fstab entry already owns ${expected[1]}`,
        };
  }
  const prefix =
    current.endsWith("\n") || current === "" ? current : `${current}\n`;
  return { content: `${prefix}${declaredLine.trim()}\n`, changed: true };
}

async function installFstabEntry(): Promise<Error | undefined> {
  const declaration = await attempt(() =>
    Bun.file(join(import.meta.dir, "gdrive.fstab")).text(),
  );
  if (!declaration.ok)
    return new Error(
      `cannot read wsl/gdrive.fstab: ${errorMessage(declaration.error)}`,
    );
  const declared = declaration.value
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line !== "" && !line.startsWith("#"));
  if (declared === undefined)
    return new Error("wsl/gdrive.fstab has no active entry");
  const current = await attempt(() => Bun.file(FSTAB).text());
  if (!current.ok)
    return new Error(`cannot read ${FSTAB}: ${errorMessage(current.error)}`);
  const update = ensureFstabEntry(current.value, declared);
  if (update.conflict !== undefined) return new Error(update.conflict);
  if (!update.changed) {
    process.stdout.write(`current: ${FSTAB} already declares ${declared}\n`);
    return undefined;
  }

  const fstabStat = await attempt(() => stat(FSTAB));
  if (!fstabStat.ok)
    return new Error(
      `cannot inspect ${FSTAB}: ${errorMessage(fstabStat.error)}`,
    );
  const mode = fstabStat.value.mode & 0o777;
  const temp = join(dirname(FSTAB), `.fstab.dotfiles-${randomUUID()}`);
  const written = await attempt(async () => {
    await Bun.write(temp, update.content);
    await chmod(temp, mode);
    await rename(temp, FSTAB);
  });
  if (!written.ok)
    return new Error(`cannot update ${FSTAB}: ${errorMessage(written.error)}`);
  process.stdout.write(`updated: ${FSTAB} with ${declared}\n`);
  return undefined;
}

async function main(): Promise<void> {
  if (process.getuid?.() !== 0) {
    const timeout = AbortSignal.timeout(20_000);
    const elevated = Bun.spawn(
      ["sudo", "-n", process.execPath, import.meta.path],
      {
        stdout: "inherit",
        stderr: "inherit",
        signal: timeout,
      },
    );
    process.exitCode = await elevated.exited;
    if (timeout.aborted) {
      process.stderr.write(
        "FATAL: sudo fstab install timed out after 20 seconds\n",
      );
      process.exitCode = 2;
    }
    return;
  }
  const mountDir = await attempt(() => mkdir("/mnt/g", { recursive: true }));
  if (!mountDir.ok) {
    process.stderr.write(
      `FATAL: cannot prepare /mnt/g: ${errorMessage(mountDir.error)}\n`,
    );
    process.exitCode = 2;
    return;
  }
  const result = await installFstabEntry();
  if (result !== undefined) {
    process.stderr.write(`FATAL: ${result.message}\n`);
    process.exitCode = 2;
  }
}

if (import.meta.main) await main();
