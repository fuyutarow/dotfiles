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
  return `disk-reclaim: WSL guest free delta ${signed(guestDelta)} (${gib(guestDelta)}); Windows host C: free delta ${signed(hostDelta)} (${gib(hostDelta)}). Sparse-VHDX space return is lazy; full return needs offline compaction via reclaim:vhdx.`;
}
