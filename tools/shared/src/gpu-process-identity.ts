// Bounded, named proc reads only. Numeric equality is not driver namespace proof.
import { constants } from "node:fs";
import { open, readlink } from "node:fs/promises";
import { join } from "node:path";
import { z } from "./zod.ts";
import type { GpuState } from "./gpu-samples.ts";

type Identity = NonNullable<GpuState["processIdentity"]>;
type Observation = Identity["collector"];
type Read = Observation["before"];
export type IdentityIo = {
  read: (path: string) => Promise<string>;
  readlink: (path: string) => Promise<string>;
};
const io: IdentityIo = {
  read: async (path) => {
    const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
    await using _file = { [Symbol.asyncDispose]: () => file.close() };
    const buffer = Buffer.alloc(4096);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead).toString();
  },
  readlink,
};
const unavailable = { status: "limit" } satisfies Read;
const Stat = z.object({
  pid: z.number().int().positive(),
  starttime: z.string().regex(/^\d+$/u),
});
function stat(text: Read) {
  if (text.status !== "read") return null;
  const match = /^(\d+) \(.*\) ([\s\S]*)$/u.exec(text.value.trim());
  const fields = match?.[2]?.split(/\s+/u);
  const parsed = Stat.safeParse({
    pid: Number(match?.[1]),
    starttime: fields?.[19],
  });
  return parsed.success ? parsed.data : null;
}

/** At most 64 reported rows, 4096 bytes/read, one 100ms budget, no proc enumeration. */
export async function collectGpuProcessIdentity(
  processes: GpuState["processes"],
  sampleAt: number,
  options: {
    procRoot?: string;
    identityIo?: IdentityIo;
    now?: () => number;
    platform?: string;
  } = {},
): Promise<Identity> {
  const root = options.procRoot ?? "/proc";
  const source = options.identityIo ?? io;
  const clock = options.now ?? (() => Temporal.Now.instant().epochMilliseconds);
  const started = clock();
  const deadline = performance.now() + 100;
  const linux = (options.platform ?? process.platform) === "linux";
  let exhausted = false;
  async function read(path: string, link = false): Promise<Read> {
    if (!linux) return { status: "unsupported" };
    const remaining = deadline - performance.now();
    if (exhausted || remaining <= 0) return unavailable;
    let timer: ReturnType<typeof setTimeout> | undefined;
    return Promise.race([
      Promise.try(() => (link ? source.readlink(path) : source.read(path)))
        .then((value): Read =>
          Buffer.byteLength(value) <= 4096
            ? { status: "read", value: value.trim() }
            : unavailable,
        )
        .catch((error: unknown): Read => {
          const parsed = z.object({ code: z.string() }).safeParse(error);
          if (!parsed.success) return { status: "error" };
          if (["ENOENT", "ESRCH"].includes(parsed.data.code))
            return { status: "missing" };
          if (["EACCES", "EPERM"].includes(parsed.data.code))
            return { status: "permission" };
          return { status: "error" };
        }),
      new Promise<Read>((resolve) => {
        timer = setTimeout(() => {
          exhausted = true;
          resolve(unavailable);
        }, remaining);
      }),
    ]).finally(() => {
      clearTimeout(timer);
    });
  }
  async function observe(pid: number, directory: string): Promise<Observation> {
    const captureStartedAt = clock();
    const before = await read(join(directory, "stat"));
    const processStatus = await read(join(directory, "status"));
    const namespace = await read(join(directory, "ns/pid"), true);
    const after = await read(join(directory, "stat"));
    const first = stat(before);
    const last = stat(after);
    const statusText =
      processStatus.status === "read" ? processStatus.value : undefined;
    const tgid = Number(/^Tgid:\s*(\d+)$/mu.exec(statusText ?? "")?.[1]);
    const statusPid = Number(/^Pid:\s*(\d+)$/mu.exec(statusText ?? "")?.[1]);
    const nspid = /^NSpid:\s*([\d\t ]+)$/mu
      .exec(statusText ?? "")?.[1]
      ?.trim()
      .split(/\s+/u)
      .map(Number);
    const localParsed = z
      .object({
        pid: z.number().int().positive(),
        tgid: z.number().int().positive(),
        nspid: z.array(z.number().int().positive()).max(32),
        starttime: z.string().regex(/^\d+$/u),
      })
      .safeParse({ pid: statusPid, tgid, nspid, starttime: first?.starttime });
    let status: Observation["status"] = "read";
    const reads = [before, processStatus, namespace, after];
    if (reads.some((r) => r.status === "unsupported")) status = "unsupported";
    else if (before.status === "missing") status = "missing-before";
    else if (after.status === "missing") status = "missing-after";
    else if (reads.some((r) => r.status === "permission"))
      status = "permission";
    else if (reads.some((r) => r.status === "limit")) status = "limit";
    else if (
      first !== null &&
      last !== null &&
      (first.pid !== last.pid || first.starttime !== last.starttime)
    )
      status = "reuse";
    else if (
      reads.some((r) => r.status !== "read") ||
      !localParsed.success ||
      first?.pid !== pid ||
      last?.pid !== pid ||
      statusPid !== pid ||
      namespace.status !== "read" ||
      !/^pid:\[\d+\]$/u.test(namespace.value)
    )
      status = "error";
    return {
      rawDriverPid: pid,
      captureStartedAt,
      captureFinishedAt: clock(),
      status,
      before,
      after,
      processStatus,
      namespace,
      ...(status === "read" && localParsed.success
        ? { local: localParsed.data }
        : {}),
    };
  }
  const bootId = await read(join(root, "sys/kernel/random/boot_id"));
  const collector = await observe(process.pid, join(root, "self"));
  const rows: Observation[] = [];
  for (const row of processes.slice(0, 64)) {
    if (exhausted || performance.now() >= deadline) break;
    rows.push(await observe(row.pid, join(root, String(row.pid))));
  }
  return {
    version: 1,
    sampleAt,
    captureStartedAt: started,
    captureFinishedAt: clock(),
    driverBinding: "unknown",
    bootId,
    collector,
    processes: rows,
    omittedProcesses: processes.length - rows.length,
  };
}
