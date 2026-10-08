import { readdirSync, readlinkSync } from "node:fs";
import { join } from "node:path";
import { fromThrowable } from "../../../shared/src/zod.ts";

/** Exact process-name probe; missing pgrep mirrors the shell's false condition. */
export function processBusy(
  comm: string,
  spawn: typeof Bun.spawnSync = Bun.spawnSync,
): boolean {
  const result = fromThrowable(() =>
    spawn(["pgrep", "-u", String(process.getuid?.() ?? 0), "-x", comm], {
      stdout: comm === "bun" ? "pipe" : "ignore",
      stderr: "ignore",
    }),
  )();
  if (result.isErr() || result.value.exitCode !== 0) return false;
  if (comm !== "bun") return true;
  const output = result.value.stdout?.toString() ?? "";
  if (output.trim() === "") return true;
  const current = String(process.pid);
  return output
    .trim()
    .split(/\s+/u)
    .some((pid) => pid !== current);
}

/** Process working directories for cargo/rustc, or undefined when /proc is unavailable. */
export function busyCwds(procDir = "/proc"): string[] | undefined {
  const pids = fromThrowable(() => readdirSync(procDir))();
  if (pids.isErr()) return undefined;
  return pids.value
    .filter((pid) => /^\d+$/u.test(pid))
    .flatMap((pid) => {
      const exe = fromThrowable(() =>
        readlinkSync(join(procDir, pid, "exe"))
          .split("/")
          .at(-1),
      )();
      if (exe.isErr() || (exe.value !== "cargo" && exe.value !== "rustc"))
        return [];
      return fromThrowable(() =>
        readlinkSync(join(procDir, pid, "cwd")),
      )().match(
        (cwd) => [cwd],
        () => [],
      );
    });
}
