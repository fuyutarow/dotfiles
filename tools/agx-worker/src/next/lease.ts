import { fromThrowable } from "neverthrow";
import { z } from "../../../shared/src/zod.ts";

export const StopSignal = z.enum(["SIGTERM", "SIGINT", "SIGHUP"]);
export type StopSignal = z.output<typeof StopSignal>;
export const Lease = z.object({
  pid: z.number(),
  start: z.string().nullable(),
  unit: z.string().nullable(),
});
export const Evidence = z.object({
  reason: z.enum(["owner-gone", "owner-replaced"]),
  pid: z.number(),
  expected_start: z.string().nullable(),
  observed_start: z.string().nullable(),
  unit: z.string().nullable(),
  unit_result: z.string().nullable(),
});

/** Linux start ticks plus boot id survive PID reuse and distinguish host reboots. */
async function processStart(pid: number): Promise<string | null> {
  if (process.platform === "linux") {
    const [stat, boot] = await Promise.all([
      Bun.file(`/proc/${pid}/stat`)
        .text()
        .catch(() => null),
      Bun.file("/proc/sys/kernel/random/boot_id")
        .text()
        .catch(() => null),
    ]);
    if (stat === null || boot === null) return null;
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    if (fields[0] === "Z" || fields[19] === undefined) return null;
    return `${boot.trim()}:${fields[19]}`;
  }
  const child = Bun.spawn(["ps", "-p", String(pid), "-o", "lstart="], {
    stdout: "pipe",
    stderr: "ignore",
    timeout: 1000,
  });
  const [exit, text] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
  ]);
  return exit === 0 && text.trim() !== "" ? text.trim() : null;
}

export async function leaseFor(pid: number, unit: string | null) {
  return { pid, start: await processStart(pid), unit };
}

export async function lossEvidence(
  lease: z.output<typeof Lease>,
): Promise<z.output<typeof Evidence> | undefined> {
  const alive =
    lease.pid > 0 && fromThrowable(() => process.kill(lease.pid, 0))().isOk();
  const observed = alive ? await processStart(lease.pid) : null;
  if (
    alive &&
    (lease.start === null || lease.start === observed) &&
    (process.platform !== "linux" || observed !== null)
  )
    return undefined;
  let unitResult: string | null = null;
  const systemctl = Bun.which("systemctl", { PATH: process.env.PATH ?? "" });
  if (lease.unit !== null && systemctl !== null) {
    const child = Bun.spawn(
      [systemctl, "--user", "show", lease.unit, "--property=Result", "--value"],
      {
        stdout: "pipe",
        stderr: "ignore",
        timeout: 1000,
      },
    );
    const [exit, text] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
    ]);
    if (exit === 0 && text.trim() !== "") unitResult = text.trim();
  }
  return {
    reason: alive && observed !== null ? "owner-replaced" : "owner-gone",
    pid: lease.pid,
    expected_start: lease.start,
    observed_start: observed,
    unit: lease.unit,
    unit_result: unitResult,
  };
}
