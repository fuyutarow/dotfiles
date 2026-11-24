import { Result } from "@dotfiles/shared/src/result.ts";

/** Exact process-name probe; missing pgrep mirrors the shell's false condition. */
export function processBusy(
  comm: string,
  spawn: typeof Bun.spawnSync = Bun.spawnSync,
): boolean {
  const result = Result.try({
    try: () =>
      spawn(["pgrep", "-u", String(process.getuid?.() ?? 0), "-x", comm], {
        stdout: comm === "bun" ? "pipe" : "ignore",
        stderr: "ignore",
      }),
    catch: (e: unknown) => e,
  });
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
