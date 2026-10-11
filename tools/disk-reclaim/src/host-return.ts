import { readFile, statfs } from "node:fs/promises";
import { fromAsyncThrowable } from "neverthrow";

export type WslStorageSnapshot = { guestFree: number; hostCFree: number };

export async function wslStorageSnapshot(): Promise<WslStorageSnapshot | null> {
  if (process.platform !== "linux") return null;
  const result = await fromAsyncThrowable(async () => {
    const release = await readFile("/proc/sys/kernel/osrelease", "utf8");
    if (!release.toLowerCase().includes("microsoft")) return null;
    const [guest, host] = await Promise.all([statfs("/"), statfs("/mnt/c")]);
    return {
      guestFree: guest.bavail * guest.bsize,
      hostCFree: host.bavail * host.bsize,
    };
  })();
  return result.isOk() ? result.value : null;
}

export async function trimWslGuest(): Promise<{ ok: boolean; detail: string }> {
  const result = await fromAsyncThrowable(async () => {
    const signal = AbortSignal.timeout(120_000);
    const child = Bun.spawn(["sudo", "-n", "fstrim", "-v", "/"], {
      stdout: "pipe",
      stderr: "pipe",
      signal,
    });
    const [out, err, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    let detail = `${out}${err}`.trim();
    if (signal.aborted) detail = "fstrim timed out after 120 seconds";
    else if (detail.length === 0) detail = `fstrim exited ${code}`;
    return {
      ok: code === 0 && !signal.aborted,
      detail,
    };
  })();
  return result.match(
    (value) => value,
    (error) => ({
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    }),
  );
}

export async function sampleWslReturn(
  before: WslStorageSnapshot,
  options: {
    samples?: number;
    intervalMs?: number;
    snapshot?: () => Promise<WslStorageSnapshot | null>;
    sleep?: (milliseconds: number) => Promise<void>;
  } = {},
): Promise<WslStorageSnapshot> {
  const samples = options.samples ?? 10;
  const intervalMs = options.intervalMs ?? 1_000;
  const snapshot = options.snapshot ?? wslStorageSnapshot;
  const sleep = options.sleep ?? ((milliseconds) => Bun.sleep(milliseconds));
  let latest = before;
  let bestHostFree = before.hostCFree;
  for (let index = 0; index < samples; index += 1) {
    await sleep(intervalMs);
    const measured = await snapshot();
    if (measured === null) continue;
    latest = measured;
    bestHostFree = Math.max(bestHostFree, measured.hostCFree);
  }
  return { guestFree: latest.guestFree, hostCFree: bestHostFree };
}

const gib = (bytes: number): string => `${(bytes / 2 ** 30).toFixed(1)} GiB`;
const signed = (bytes: number): string =>
  `${bytes >= 0 ? "+" : ""}${bytes} bytes`;

export function wslReturnReport(
  before: WslStorageSnapshot | null,
  after: WslStorageSnapshot | null,
): string | null {
  if (before === null || after === null) return null;
  const guestDelta = after.guestFree - before.guestFree;
  const hostDelta = after.hostCFree - before.hostCFree;
  return `disk-reclaim: WSL guest free delta ${signed(guestDelta)} (${gib(guestDelta)}); Windows host C: free delta ${signed(hostDelta)} (${gib(hostDelta)}), sampled for up to 10 seconds after fstrim.`;
}
